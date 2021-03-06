const { Environment } = require('@azure/ms-rest-azure-env');
const msRestNodeAuth = require('@azure/ms-rest-nodeauth');
const armResources = require('@azure/arm-resources');
const armSubscriptions = require('@azure/arm-subscriptions');
const { daysAgo, deleteResourceById, listResources, listResourcesOnResourceGroup, listResourceGroups } = require('./utils');
const ResourceCleaner = require('./resourceCleaner');

async function doCleanup(subsId, subsName, ttl, excludeList, client, secret, tenant) {
  try {
    let cred = !client && !secret && !tenant ? await msRestNodeAuth.interactiveLogin() : await msRestNodeAuth.loginWithServicePrincipalSecret(client, secret, tenant, {
      environment: Environment.AzureCloud
    });
    doCleanupCore(subsId, subsName, ttl, excludeList, cred);
  } catch (ex) {
    console.log(ex);
    process.exitCode = 1;
  }
}

async function doCleanupCore(subsId, subsName, ttl, excludeList, cred) {

  // do a subscription check first, to ensure resources doesn't get cleaned up by accident
  let subscriptionClient = new armSubscriptions.SubscriptionClient(cred);
  let sub = await subscriptionClient.subscriptions.get(subsId);
  if (sub.displayName !== subsName) throw `Subscription does not match! Expected subscription: ${subsName}, actual subscription: ${sub.displayName}`;
  let cleaner = new ResourceCleaner(cred, subsId);

  console.log(`Start cleaning resources in subscription: ${subsName} (${subsId}), delete resources created over ${ttl} days.`);
  let resourceClient = new armResources.ResourceManagementClient(cred, subsId);
  let resources = await listResources(resourceClient);
  let stats = {
    totalResources: resources.length,
    toDeleteResources: 0,
    deletedResources: 0,
    lockedResources: 0,
    totalGroups: 0,
    toDeleteGroups: 0,
    deletedGroups: 0,
    lockedGroups: 0
  };

  let now = new Date();
  let exclude = excludeList.split(',');
  let excludedResources = [];
  // delete newly created resources first to solve dependency issues
  for (let r of resources.sort((x, y) => y.createdTime - x.createdTime)) {
    console.log(`Processing ${r.id}`);

    let ids = r.id.split('/');
    let group = ids[4];
    if (exclude.indexOf(group) >= 0) {
      excludedResources.push(r.id);
      console.log('  In exclude list, skip.');
      continue;
    }

    let daysCreate = daysAgo(r.createdTime);
    if (daysCreate <= ttl) {
      console.log(`  Created ${daysCreate} day(s) ago, skip.`);
      continue;
    }
    try {
      stats.toDeleteResources++;
      console.log(`  Created ${daysCreate} day(s) days ago, deleting...`);
      await cleaner.cleanup(group, r.type, r.name);
      await deleteResourceById(resourceClient, r.type, r.id);
      console.log('  Deleted.');
      stats.deletedResources++;
    } catch (err) {
      console.log(`##vso[task.logissue type=warning]Failed to delete resource due to ${err.code || 'Unknown'}: ${r.id}`);
      if (err.code === 'ScopeLocked') stats.lockedResources++;
      if (err.statusCode) {
        console.log(`  Failed. HTTP status code: ${err.statusCode}, error code: ${err.code}, error message:`);
        console.log('    ' + (err.body.message || err.body.Message));
      } else {
        console.log('  Failed. ' + err);
      }
    }
  }

  // delete empty groups
  for (let rg of (await listResourceGroups(resourceClient))) {
    const g = rg.name;
    stats.totalGroups++;
    console.log(`Processing resource group: ${g}...`);
    const rc = (await listResourcesOnResourceGroup(resourceClient, g)).length;
    if (rc) {
      console.log(`  ${rc} resources in this group, skip.`);
      continue;
    } else {
      try {
        stats.toDeleteGroups++;
        console.log('  No resources in this group, deleting...');
        await resourceClient.resourceGroups.deleteMethod(g);
        console.log('  Deleted');
        stats.deletedGroups++;
      } catch (err) {
        console.log(`##vso[task.logissue type=warning]Failed to delete resource group due to ${err.code || 'Unknown'}: ${g}`);
        if (err.code === 'ScopeLocked') stats.lockedGroups++;
        if (err.statusCode) {
          console.log(`  Failed. HTTP status code: ${err.statusCode}, error code: ${err.code}, error message:`);
          console.log('    ' + (err.body.message || err.body.Message));
        } else {
          console.log('  Failed. ' + err);
        }
      }
    }
  }

  console.log(`Cleanup completed in ${(new Date() - now) / 1000} seconds, summary:`);
  console.log(`  Resource processed: ${stats.totalResources}`);
  console.log(`  Resource can be deleted: ${stats.toDeleteResources}`);
  console.log(`  Resource deleted: ${stats.deletedResources}`);
  console.log(`  Resource locked: ${stats.lockedResources}`);
  console.log(`  Resource failed to delete: ${stats.toDeleteResources - stats.lockedResources - stats.deletedResources}`);
  console.log(`  Resource group processed: ${stats.totalGroups}`);
  console.log(`  Resource group can be deleted: ${stats.toDeleteGroups}`);
  console.log(`  Resource group deleted: ${stats.deletedGroups}`);
  console.log(`  Resource group locked: ${stats.lockedGroups}`);
  console.log(`  Resource group failed to delete: ${stats.toDeleteGroups - stats.lockedGroups - stats.deletedGroups}`);
  console.log(`  Following resources are in the exclude list:`);
  excludedResources.forEach(r => console.log(`    ${r}`));

  // fail the program if any delete failed
  if (stats.toDeleteResources !== stats.deletedResources + stats.lockedResources || stats.toDeleteGroups !== stats.deletedGroups + stats.lockedGroups) process.exitCode = 10;
  else if (stats.lockedResources !== 0 || stats.lockedGroups) process.exitCode = 11;
}

if (process.argv.length < 6) {
  console.log('Usage: node index.js <subscription_id> <subscription_name> <ttl_in_day> <exclude_list> [<client_id> <client_secret> <tenant_id>]');
  console.log('  client_id, client_secret and tenant_id can be omitted, if so interactive login will be used')
  process.exitCode = 2;
  return;
}

const subscriptionId = process.argv[2];
const subscriptionName = process.argv[3];
const ttl = process.argv[4];
const excludeList = process.argv[5];
const clientId = process.argv[6];
const clientSecret = process.argv[7];
const tenantId = process.argv[8];

doCleanup(subscriptionId, subscriptionName, ttl, excludeList, clientId, clientSecret, tenantId);
