import type { SqliteBuilder } from '../src'
import type { DB } from './utils'

import { beforeEach, describe, expect, it } from 'bun:test'

import { useSchema } from '../src/schema'
import { baseTables, getDatabaseBuilder } from './utils'

describe('test buffer type', async () => {
  let db: SqliteBuilder<DB>
  beforeEach(async () => {
    db = getDatabaseBuilder()
    await db.syncDB(useSchema(baseTables))
  })
  // node sqlite wasm always return Uint8Array
  it('test Buffer', async () => {
    const testBuffer = Buffer.alloc(4).fill(0xDD) as any
    await db.insertInto('blob').values({ id: 0, buffer: testBuffer }).execute()
    const result = await db.selectFrom('blob').where('id', '=', 0).selectAll().executeTakeFirstOrThrow()

    expect(result.buffer).toBeInstanceOf(Uint8Array)
    expect(result.buffer!.buffer).toStrictEqual(testBuffer.buffer)
  })
  it('test Uint8Array', async () => {
    const testUint8Array = new Uint8Array([0x11, 0x22, 0x33, 0x44])
    await db.insertInto('blob').values({ id: 1, uint8: testUint8Array }).execute()
    const result = await db.selectFrom('blob').where('id', '=', 1).selectAll().executeTakeFirst()

    expect(result!.uint8).toBeInstanceOf(Uint8Array)
    expect(result!.uint8?.buffer).toStrictEqual(testUint8Array?.buffer)
  })
})
