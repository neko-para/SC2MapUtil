import { SimpleParser } from '../parser.js'
import { DLibrary, DFolder } from './types.js'

interface TokenTypes {
  $library: null
  $folder: null
  '$,': null
  '${': null
  '$}': null
  $str: string
  $label: string

  Librarys: DLibrary[]
  Library: DLibrary
  Folder: DFolder
  Item: string | DFolder
  Items: (string | DFolder)[]
}

export function CreateParser() {
  const parser = new SimpleParser<TokenTypes>(
    /[ \n\r\t]+/,
    {
      $str: /"[\s\S]*?"/,
      $label:
        /[\p{Unified_Ideograph}a-zA-Z_][\p{Unified_Ideograph}a-zA-Z0-9_]*/u,
    },
    {
      $str: s => s.substring(1, s.length - 1),
    },
    ['$library', '$folder', '$,', '${', '$}']
  )

  parser.rule
    .entry('Librarys')
    .with(r => r._some('Librarys', 'Library'))
    .for('Library')
    .when('$library', '$str', '$str', '${', 'Items', '$}')
    .do((_, name, desc, _2, item) => ({
      name,
      desc,
      item,
    }))

    .for('Folder')
    .when('$folder', '$str', '${', 'Items', '$}')
    .do((_, desc, _2, item) => ({
      desc,
      item,
    }))

    .with(r => r._some_sep('Items', 'Item', '$,'))
    .for('Item')
    .sameas('$label')
    .sameas('Folder')

  return parser
}

function TraceIntoFolder(
  item: (DFolder | string)[],
  lib: string,
  gen: (lib: string) => string,
  put: (type: 'ts' | 'gs', text: string) => void
) {
  item.forEach(it => {
    if (typeof it === 'string') {
      return
    }
    it.id = gen(lib)
    put(
      'ts',
      `Category/Name/${lib === '0' ? '' : `lib_${lib}_`}${it.id}=${it.desc}`
    )
    TraceIntoFolder(it.item, lib, gen, put)
  })
}

export function GenerateId(
  progs: DLibrary[],
  gen: (lib: string) => string,
  put: (type: 'ts' | 'gs', text: string) => void
) {
  progs.forEach(prog => {
    const lib = prog.name
    if (lib !== '0') {
      put('ts', `Library/Name/${lib}=${prog.desc}`)
    }
    TraceIntoFolder(prog.item, lib, gen, put)
  })
  return progs
}
