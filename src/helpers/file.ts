import { FileObject } from '#file_object/repository'
import { Effect } from 'effect'
import { FileItem } from 'src/file/repository'

export const fileIntoObject = function (file: FileItem) {
    return Effect.gen(function* () {
        const content = yield* file.content
        const contentType = yield* file.contentType

        return {
            key: file.relativePath,
            content: content,
            contentType: contentType.mime,
            cacheControlValue: undefined,
        } satisfies FileObject
    })
}

export const detectAndFillCacheControl = function (
    object: FileObject,
    cacheControlMapping: Record<string, string>
): FileObject {
    for (const [keyRawRegExp, cacheControlValue] of Object.entries(cacheControlMapping)) {
        const isCorrectCacheControl = new RegExp(keyRawRegExp).test(object.key)

        if (isCorrectCacheControl) {
            return {
                ...object,
                cacheControlValue,
            }
        }
    }

    return object
}
