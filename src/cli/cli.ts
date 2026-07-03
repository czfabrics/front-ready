import { checkCommand } from '#cli/check_command'
import { createFrontBucketCommand } from '#cli/create_front_bucket_command'
import { deployOnBucketCommand } from '#cli/deploy_on_bucket_command'
import { subcommands } from 'cmd-ts'
import packageInfo from 'package.json'

export const cli = subcommands({
  name: packageInfo.name,
  cmds: {
    create: createFrontBucketCommand,
    check: checkCommand,
    deploy: deployOnBucketCommand,
  },
})
