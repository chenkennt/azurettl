const armNetwork = require('@azure/arm-network');

const cleaner = {
  'Microsoft.Network/privateLinkServices' : cleanupPrivateLinkService
};

async function cleanupPrivateLinkService(cred, subsId, group, name) {
  let client = new armNetwork.NetworkManagementClient(cred, subsId);
  let pls = await client.privateLinkServices.get(group, name);
  pls.privateEndpointConnections.forEach(pe => await client.privateLinkServices.deletePrivateEndpointConnection(group, name, pe.name));
}

function ResourceCleaner(cred, subId) {
  this._cred = cred;
  this._subId = subId;
}

ResourceCleaner.prototype.cleanup = async (group, type, name) => cleaner[type] && await cleaner[type](this._cred, this._subsId, group, name);
module.exports = ResourceCleaner;
