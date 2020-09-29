const apiVersionTree = {};
let prepareApiVersionsPromise;

function getApiVersions(type) {
  return apiVersionTree[(type || '').toLowerCase()] || ['2020-06-01'];
}

async function prepareApiVersions(resourceClient) {
  const providers = await resourceClient.providers.list();
  for (const provider of providers) {
    if (provider.registrationState === 'Registered') {
      for (const resourceType of provider.resourceTypes) {
        if (resourceType && resourceType.apiVersions) {
          const key = provider.namespace.toLowerCase() + '/' + resourceType.resourceType.toLowerCase();
          apiVersionTree[key] = resourceType.apiVersions;
        }
      }
    }
  }
}

async function paginationLoop(func1, func2) {
  let res = [];
  let resources = await func1();
  if (!resources) {
    return res;
  }
  res = [...resources];
  let nextLink = resources.nextLink;
  let page = 1;
  while (nextLink) {
    resources = await func2(nextLink);
    res = [...res, ...resources];
    nextLink = resources.nextLink;
    page++;
    if (page > 100) {
      console.log('Reach limit of 100 pages, skip remaining resources')
      break;
    }
  }
  return res;
}

function listResourcesOnResourceGroup(resourceClient, resourceGroupName) {
  return paginationLoop(() => resourceClient.resources.listByResourceGroup(resourceGroupName, { expand: 'createdTime,properties,tags' }),
    (nextLink) => resourceClient.resources.listByResourceGroupNext(nextLink));
}

async function listResourceGroups(resourceClient) {
  return paginationLoop(() => resourceClient.resourceGroups.list({ expand: 'tags' }),
    (nextLink) => resourceClient.resourceGroups.listNext(nextLink));
}

async function listResources(resourceClient) {
  return paginationLoop(() => resourceClient.resources.list({ expand: 'createdTime,properties,tags' }),
    (nextLink) => resourceClient.resources.listNext(nextLink));
}

async function deleteResourceById(resourceClient, type, id) {
  if (!prepareApiVersionsPromise) {
    prepareApiVersionsPromise = prepareApiVersions(resourceClient);
  }
  await prepareApiVersionsPromise;
  for (const v of getApiVersions(type)) {
    try {
      return await resourceClient.resources.deleteById(id, v, { properties: ['createdTime'] });
    } catch (e) {
      if (e.message.includes('The supported api-versions')) {
        continue;
      }
      throw e;
    }
  }
  throw new Error('all api versions tried');
}

function hoursAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  return Math.floor(seconds / 3600);
}

function daysAgo(date) {
  return Math.floor(hoursAgo(date) / 24);
}

exports.listResources = listResources;
exports.deleteResourceById = deleteResourceById;
exports.hoursAgo = hoursAgo;
exports.daysAgo = daysAgo;
exports.listResourcesOnResourceGroup = listResourcesOnResourceGroup;
exports.listResourceGroups = listResourceGroups;