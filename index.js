const msRestNodeAuth = require('@azure/ms-rest-nodeauth');
const armResources = require('@azure/arm-resources');
const armSubscriptions = require('@azure/arm-subscriptions');

async function doCleanup(clientId, clientSecret, subscriptionId, subscriptionName, tenantId, ttl) {
  const cache = {
    providers: {},
    apiVersions: {}
  };

  let cred = await msRestNodeAuth.loginWithServicePrincipalSecret(clientId, clientSecret, tenantId);

  // do a subscription check first, to ensure resources doesn't get cleaned up by accident
  let subscriptionClient = new armSubscriptions.SubscriptionClient(cred);
  let sub = await subscriptionClient.subscriptions.get(subscriptionId);
  if (sub.displayName !== subscriptionName) throw `Subscription does not match! Expected subscription: ${subscriptionName}, actual subscription: ${sub.displayName}`;

  console.log(`Start cleaning resources in subscription: ${subscriptionName} (${subscriptionId}), delete resources created over ${ttl} hours.`);

  let resourceClient = new armResources.ResourceManagementClient(cred, subscriptionId);

  async function getApiVersion(type) {
    if (cache.apiVersions[type]) return cache.apiVersions[type];
    let i = type.indexOf('/');
    let providerName = type.slice(0, i);
    let resourceType = type.slice(i + 1);
    cache.providers[providerName] = cache.providers[providerName] || await resourceClient.providers.get(providerName);
    let resource = cache.providers[providerName].resourceTypes.filter(t => t.resourceType === resourceType)[0];
    return cache.apiVersions[type] = resource.defaultApiVersion || resource.apiVersions[0];
  }

  let resources = await resourceClient.resources.list({ expand: 'createdTime' });
  let stats = {
    totalResources: resources.length,
    toDeleteResources: 0,
    deletedResources: 0,
    totalGroups: 0,
    toDeleteGroups: 0,
    deletedGroups: 0
  };
  let now = new Date();
  let groups = {};
  const groupRegex = /\/subscriptions\/[^\/]*\/resourceGroups\/([^\/]*)/;
  // delete newly created resources first to solve dependency issues
  for (let r of resources.sort((x, y) => y.createdTime - x.createdTime)) {
    let match = groupRegex.exec(r.id);
    if (!match || !match[1]) throw `Cannot get resource group from id: ${r.id}`;
    groups[match[1]] = (groups[match[1]] || 0) + 1;
    let l = (now - r.createdTime) / (1000 * 3600);
    console.log(`Processing ${r.id}`);
    if (l <= ttl) {
      console.log(`  Created ${Math.floor(l / 24)} day ${Math.floor(l % 24)} hour ago, skip.`);
      continue;
    }
    try {
      stats.toDeleteResources++;
      console.log(`  Created ${Math.floor(l / 24)} day ${Math.floor(l % 24)} hour ago, deleting...`);
      await resourceClient.resources.deleteById(r.id, (await getApiVersion(r.type, resourceClient)));
      console.log('  Deleted.');
      groups[match[1]]--;
      stats.deletedResources++;
    } catch (err) {
      if (err.statusCode) {
        console.log(`  Failed. HTTP status code: ${err.statusCode}, error code: ${err.code}, error message:`);
        console.log('    ' + (err.body.message || err.body.Message));
      } else {
        console.log('  Failed. ' + err);
      }
    }
  }

  // delete groups which become empty after cleanup
  for (let g in groups) {
    stats.totalGroups++;
    console.log(`Processing resource group: ${g}...`);
    if (groups[g] !== 0) {
      console.log(`  ${groups[g]} resources in this group, skip.`);
      continue;
    }
    try {
      stats.toDeleteGroups++;
      console.log('  No resources in this group, deleting...');
      await resourceClient.resourceGroups.deleteMethod(g);
      console.log('  Deleted');
      stats.deletedGroups++;
    } catch (err) {
      if (err.statusCode) {
        console.log(`  Failed. HTTP status code: ${err.statusCode}, error code: ${err.code}, error message:`);
        console.log('    ' + (err.body.message || err.body.Message));
      } else {
        console.log('  Failed. ' + err);
      }
    }
  }

  console.log(`Cleanup completed in ${(new Date() - now) / 1000} seconds, summary:`);
  console.log(`  Resource processed: ${stats.totalResources}`);
  console.log(`  Resource can be deleted: ${stats.toDeleteResources}`);
  console.log(`  Resource deleted: ${stats.deletedResources}`);
  console.log(`  Resource failed to delete: ${stats.toDeleteResources - stats.deletedResources}`);
  console.log(`  Resource group processed: ${stats.totalGroups}`);
  console.log(`  Resource group can be deleted: ${stats.toDeleteGroups}`);
  console.log(`  Resource group deleted: ${stats.deletedGroups}`);
  console.log(`  Resource group failed to delete: ${stats.toDeleteGroups - stats.deletedGroups}`);
}

const clientId = '***';
const clientSecret = '***';
const subscriptionId = '***';
const subscriptionName = '***';
const tenantId = '***';
const ttl = 0.01;
doCleanup(clientId, clientSecret, subscriptionId, subscriptionName, tenantId, ttl);
