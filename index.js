const msRestNodeAuth = require('@azure/ms-rest-nodeauth');
const armResources = require('@azure/arm-resources');
const armSubscriptions = require('@azure/arm-subscriptions');
const { daysAgo, deleteResourceById, listResources, listResourcesOnResourceGroup, listResourceGroups } = require("./utils");
const { Environment } = require("@azure/ms-rest-azure-env");
async function doCleanup(client, secret, subsId, subsName, tenant, ttl) {

    let cred = await msRestNodeAuth.loginWithServicePrincipalSecret(client, secret, tenant, {
      environment: Environment.AzureCloud
    });
    // do a subscription check first, to ensure resources doesn't get cleaned up by accident
    let subscriptionClient = new armSubscriptions.SubscriptionClient(cred);
    let sub = await subscriptionClient.subscriptions.get(subsId);
    if (sub.displayName !== subsName) throw `Subscription does not match! Expected subscription: ${subsName}, actual subscription: ${sub.displayName}`;

    console.log(`Start cleaning resources in subscription: ${subsName} (${subsId}), delete resources created over ${ttl} days.`);
    let resourceClient = new armResources.ResourceManagementClient(cred, subsId);
    let resources = await listResources(resourceClient);
    let stats = {
        totalResources: resources.length,
        toDeleteResources: 0,
        deletedResources: 0,
        totalGroups: 0,
        toDeleteGroups: 0,
        deletedGroups: 0
    };
    let now = new Date();
    // delete newly created resources first to solve dependency issues
    for (let r of resources.sort((x, y) => y.createdTime - x.createdTime)) {
        let daysCreate = daysAgo( r.createdTime);
        console.log(`Processing ${r.id}`);
        if (daysCreate <= ttl) {
            console.log(`  Created ${daysCreate} day(s) ago, skip.`);
            continue;
        }
        try {
            stats.toDeleteResources++;
            console.log(`  Created ${daysCreate} day(s) days ago, deleting...`);
            await deleteResourceById(resourceClient, r.type, r.id);
            console.log('  Deleted.');
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
    for (let rg of (await listResourceGroups(resourceClient))) {
        const g = rg.name;
        stats.totalGroups++;
        console.log(`Processing resource group: ${g}...`);
        const rc = (await listResourcesOnResourceGroup(resourceClient, g)).length;
        if (rc) {
            console.log(`  ${rc} resources in this group, skip.`);
            continue;
        }
        if (0 == rc) {
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
const TTL = 7;
// doCleanup(clientId, clientSecret, subscriptionId, subscriptionName, tenantId, TTL).catch(console.log);
console.log('hello world');
