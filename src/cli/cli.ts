import { createFrontBucketCommand } from '#cli/create_front_bucket_command'
import { deployOnBucketCommand } from '#cli/deploy_on_bucket_command'
import { subcommands } from 'cmd-ts'
import packageInfo from 'package.json'

export const cli = subcommands({
    name: packageInfo.name,
    cmds: { deploy: deployOnBucketCommand, create: createFrontBucketCommand },
})
