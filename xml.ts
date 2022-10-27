import fs from 'fs/promises'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

export interface XmlAttrs {
  [key: string]: string
}

export interface XmlNode {
  tag: string
  attr: XmlAttrs
  child: XmlNode[]
}

export interface XmlTextNode extends XmlNode {
  tag: '#text',
  attr: {
    text: string
  }
  child: never[]
}

async function readXml (path: string) {
  const buf = await fs.readFile(path)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    preserveOrder: true,
    ignoreDeclaration: true,
    alwaysCreateTextNode: true
  })
  return parser.parse(buf)
}

function postProcess (node: any): XmlNode {
  const ks = Object.keys(node).filter(k => k !== ':@')
  if (ks.length !== 1) {
    console.log('?')
    return
  }
  if (ks[0] === '#text') {
    return {
      tag: '#text',
      attr: {
        text: node['#text']
      },
      child: []
    }
  } else {
    return {
      tag: ks[0],
      attr: node[':@'] || {},
      child: node[ks[0]].map(postProcess)
    }
  }
}

function postProcessBackward (node: XmlNode): any {
  const res = {}
  if (node.tag === '#text') {
    return {
      '#text': node.attr.text
    }
  } else {
    res[node.tag] = node.child.map(postProcessBackward)
    for (const k in node.attr) {
      if (node.attr[k] === undefined) {
        delete node.attr[k]
      }
    }
    res[':@'] = node.attr
    return res
  }
}

export async function loadXml (path: string): Promise<XmlNode> {
  return postProcess((await readXml(path))[0])
}

export function saveXml (node: XmlNode): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    preserveOrder: true,
    // format: true,
    suppressEmptyNode: true
  })
  return builder.build([ postProcessBackward(node) ])
}
