# AzureTTL: a tool to cleanup resources for your Azure subscription

## Command-line usage

> node index.js <subscription_id> <subscription_name> <ttl_in_days> <exclude_list> <client_id> <client_secret> <tenant_id>

- `subscription_id` and `subscription_name` are the id and name of the subscription you want to cleanup
- `ttl_in_days` is the lifetime (in days) of Azure resources you want to cleanup
- `exlcude_list` is the name of the resource group you want to exclude
- `client_id`, `client_secret` and `tenant_id` is the credentials of your service principal, make sure it has the permission to the subscription

This will delete all resources that are created before `ttl_in_days` days ago.

## Run in Azure DevOps

1. Create pipeline
   1. Create a new pipeline in Azure DevOps
   1. Choose this repo
   1. Choose "Existing Azure Pipelines YAML file"
   1. Choose [azure-pipelines.yml](azure-pipelines.yml)
   1. Click "Variables"
   1. Add 7 variables: `subsId` `subsName` `ttl` `excludeList` `clientId` `clientSecret` `tenantId`
   1. Save
1. Setup schedule
   1. Go to triggers
   1. Disable continuous integration and pull request validation
   1. Add schedules as you like

Then the pipeline will run periodically to cleanup the resources. If some resources failed to delete, pipeline will succeed with a warning, go to the details of the run and you will see failed resources and failed reasons in the warning tab. Detailed error messages can be found in the raw log.

## Known issues

> IMPORTANT: this script may not be well tested, please do not use it to cleanup production resources.

Some known issues that may cause deletion to fail:

1. Resources may have dependencies (for example, app service plan may be used by app service so cannot be deleted before app service is deleted), current solution is to delete the resources by their creation date (usually newly created resources depend on old resources) but it cannot handle all cases. It is not a big issue as resources will eventually be deleted after the script runs for several times (unless there is a circular dependency which I haven't found any so far).
2. If there're too many resources to delete (especially for the first time) the script will run more than one hour which exceeds the [time limit](https://docs.microsoft.com/en-us/azure/devops/pipelines/process/phases?view=azure-devops&tabs=yaml&viewFallbackFrom=vsts#timeouts) (may vary for different ADO projects) of Azure DevOps. Again this can be mitigated by running the script for multiple times. May be able to improve by running delete operations asynchronously.
