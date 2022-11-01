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
    if (!node.child) {
      console.log(node)
    }
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

export function readXml (buf: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    preserveOrder: true,
    ignoreDeclaration: true,
    alwaysCreateTextNode: true
  })
  return postProcess(parser.parse(buf)[0])
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
