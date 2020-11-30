const armNetwork = require('@azure/arm-network');

const cleaner = {
  'Microsoft.Network/privateLinkServices' : cleanupPrivateLinkService
};

async function cleanupPrivateLinkService(cred, subsId, group, name) {
  let client = new armNetwork.NetworkManagementClient(cred, subsId);
  let pls = await client.privateLinkServices.get(group, name);
  for (let pe of pls.privateEndpointConnections)
    await client.privateLinkServices.deletePrivateEndpointConnection(group, name, pe.name);
}

function ResourceCleaner(cred, subsId) {
  this._cred = cred;
  this._subsId = subsId;
}

ResourceCleaner.prototype.cleanup = async function (group, type, name) {
  if (cleaner[type]) await cleaner[type](this._cred, this._subsId, group, name);
};

module.exports = ResourceCleaner;
