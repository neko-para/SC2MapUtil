import fs from "fs/promises"
import { AstNodeActionDefine, AstNodeFunctionDefine, AstNodeParamDefine, CreateParser } from "./sct-parse.js"
import type {
  AstNodeSection,
  AstNodeTriggerDefine,
  AstNodeVariableDefine,
  AstNodeValue,
} from "./sct-parse.js"
import { saveXml, XmlNode } from "./xml.js"

let ID = 0x10000000
function genId() {
  return (++ID).toString(16).toUpperCase().padStart(8)
}

class Context {
  param: Record<string, string>
  variable: Record<string, string>

  constructor() {
    this.param = {}
    this.variable = {}
  }
}

const TypeName = {
  文本: "text",
  字符串: "string",
  整数: "int",
  布尔: "bool",
}

const GameStrings: string[] = []
const TriggerStrings: string[] = []

const TriggerData: XmlNode = {
  tag: "TriggerData",
  attr: {},
  child: [],
}

interface FuncParamInfo {
  id: string
  lib?: string
  name: string
  type: string
}

interface FunctionInfo {
  lib?: string
  id: string
  ret?: string
  param: {
    name: string
    type: string
    id: string
  }[]
}

interface ActionInfo {
  lib?: string
  id: string
  param: {
    name: string
    type: string
    id: string
  }[]
}

const ExternalPresets: {
  [key: string]: {
    lib: string
    value: Record<string, string>
  }
} = {}
const ExternalEvents: {
  [key: string]: {
    lib: string
    id: string
  }
} = {}
const ExternalFunctions: Record<string, FunctionInfo> = {}
const ExternalActions: Record<string, ActionInfo> = {}

const Triggers: {
  [name: string]: {
    id: string
    desc: string
    event: string
    node: AstNodeTriggerDefine
  }
} = {}
const Functions: {
  [name: string]: {
    fi: FunctionInfo
    id: string
    desc: string
    node: AstNodeFunctionDefine
  }
} = {}
const Actions: {
  [name: string]: {
    fi: FunctionInfo
    id: string
    desc: string
    node: AstNodeActionDefine
  }
} = {}

function ExternalEvent(e: string) {
  const id = genId()
  const { lib, id: fid } = ExternalEvents[e]
  return {
    id,
    els: [
      {
        tag: "Element",
        attr: {
          Type: "FunctionCall",
          Id: id,
        },
        child: [
          {
            tag: "FunctionDef",
            attr: {
              Type: "FunctionDef",
              Library: lib,
              Id: fid,
            },
            child: [],
          },
        ],
      },
    ],
  }
}

function DirectValue(s: string, type: string) {
  return [
    {
      tag: "Value",
      attr: {},
      child: [
        {
          tag: "#text",
          attr: {
            text: s,
          },
          child: [],
        },
      ],
    },
    {
      tag: "ValueType",
      attr: {
        Type: type,
      },
      child: [],
    },
  ]
}

function DirectString(s: string) {
  return DirectValue(s, 'string')
}

function DirectInt(i: number) {
  return DirectValue(i.toString(), 'int')
}

function DirectBoolean(b: boolean) {
  return DirectValue(b.toString(), 'bool')
}

function DirectText(id: string, s: string) {
  GameStrings.push(`Param/Value/${id}=${s}`) // TODO: escape
  return {
    tag: "ValueType",
    attr: {
      Type: "text",
    },
    child: [],
  }
}

function VariableRefer(id: string) {
  return {
    tag: "Variable",
    attr: {
      Type: "Variable",
      Id: id,
    },
    child: [],
  }
}

function ParamRefer(id: string) {
  // if in library, need Lib key
  return {
    tag: "Parameter",
    attr: {
      Type: "ParamDef",
      Id: id,
    },
    child: [],
  }
}

function QueryFunction(func: string) {
  if (func in ExternalFunctions) {
    return ExternalFunctions[func]
  } else if (func in ExternalActions) {
    return ExternalActions[func]
  } else if (func in Functions) {
    return Functions[func].fi
  } else if (func in Actions) {
    return Actions[func].fi
  } else {
    throw "unknown function " + func
  }
}

function FunctionCall(
  ctx: Context,
  params: AstNodeValue[],
  func: string
): [XmlNode, XmlNode[]] {
  const id = genId()
  const fi = QueryFunction(func)
  const el: XmlNode = {
    tag: "Element",
    attr: {
      Type: "FunctionCall",
      Id: id,
    },
    child: [
      {
        tag: "FunctionDef",
        attr: {
          Type: "FunctionDef",
          Library: fi.lib,
          Id: fi.id,
        },
        child: [],
      },
    ],
  }
  const appending = [el]
  params.forEach((p, i) => {
    const { id: pid, els } = CreateParam(p, ctx, {
      ...fi.param[i],
      lib: fi.lib,
    })
    el.child.push({
      tag: "Parameter",
      attr: {
        Type: "Param",
        Id: pid,
      },
      child: [],
    })
    appending.push(...els)
  })
  return [
    {
      tag: "FunctionCall",
      attr: {
        Type: "FunctionCall",
        Id: id,
      },
      child: [],
    },
    appending,
  ]
}

function CreateParam(ast: AstNodeValue, ctx: Context, fpi?: FuncParamInfo) {
  const id = genId()
  const el = {
    tag: "Element",
    attr: {
      Type: "Param",
      Id: id,
    },
    child: [],
  }
  const appending: XmlNode[] = [el]
  if (fpi) {
    el.child.push({
      tag: "ParameterDef",
      attr: {
        Type: "ParamDef",
        Library: fpi.lib,
        Id: fpi.id,
      },
      child: [],
    })
  }
  switch (ast.astType) {
    case "text-value":
      el.child.push(DirectText(id, ast.text))
      break
    case "str-value":
      el.child.push(...DirectString(ast.str))
      break
    case 'int-value':
      el.child.push(...DirectInt(ast.int))
      break
    case 'bool-value':
      el.child.push(...DirectBoolean(ast.bool))
      break
    case "var-ref": {
      if (ast.variable in ctx.variable) {
        el.child.push(VariableRefer(ctx.variable[ast.variable]))
      } else if (ast.variable in ctx.param) {
        el.child.push(ParamRefer(ctx.param[ast.variable]))
      } else {
        throw "unknown variable or param " + ast.variable
      }
      break
    }
    case "func-call": {
      const [e, els] = FunctionCall(ctx, ast.params, ast.func)
      el.child.push(e)
      appending.push(...els)
      break
    }
    case "preset-value": {
      const pi = ExternalPresets[ast.preset]
      el.child.push({
        tag: "Preset",
        attr: {
          Type: "PresetValue",
          Library: pi.lib,
          Id: pi.value[ast.child],
        },
        child: [],
      })
      break
    }
  }
  return {
    id,
    els: appending,
  }
}

function VariableDefine(v: AstNodeVariableDefine, ctx: Context) {
  const id = genId()
  const el = {
    tag: "Element",
    attr: {
      Type: "Variable",
      Id: id,
    },
    child: [
      {
        tag: "VariableType",
        attr: {},
        child: [
          {
            tag: "Type",
            attr: {
              Value: TypeName[v.type],
            },
            child: [],
          },
        ],
      },
    ],
  }
  const appending: XmlNode[] = [el]
  const { id: pid, els } = CreateParam(v.value, ctx)
  appending.push(...els)
  el.child.push({
    tag: "Value",
    attr: {
      Type: "Param",
      Id: pid,
    },
    child: [],
  })
  TriggerStrings.push(`Variable/Name/${id}=${v.variable}`)
  return { id, els: appending }
}

function ParamDefine(id: string, v: AstNodeParamDefine, ctx: Context) {
  const el = {
    tag: "Element",
    attr: {
      Type: "ParamDef",
      Id: id,
    },
    child: [
      {
        tag: "ParameterType",
        attr: {},
        child: [
          {
            tag: "Type",
            attr: {
              Value: TypeName[v.type],
            },
            child: [],
          },
        ],
      },
    ],
  }
  TriggerStrings.push(`ParamDef/Name/${id}=${v.name}`)
  return { id, els: [ el ] }
}

async function main() {
  const parser = CreateParser()
  const f = await fs.readFile("test.sct")

  let res: AstNodeSection[] = null

  try {
    res = parser.parse(f.toString())
  } catch ([msg]) {
    console.log(msg)
    return
  }

  res.forEach(r => {
    switch (r.astType) {
      case "external-preset-def":
        ExternalPresets[r.name] = {
          lib: r.lib,
          value: {},
        }
        r.value.forEach(v => (ExternalPresets[r.name].value[v.name] = v.id))
        break
      case "external-event-def":
        ExternalEvents[r.name] = r.ref
        break
      case "external-func-def":
        ExternalFunctions[r.func] = {
          lib: r.ref.lib,
          id: r.ref.id,
          ret: r.ret,
          param: r.params,
        }
        break
      case "external-act-def":
        ExternalActions[r.func] = {
          lib: r.ref.lib,
          id: r.ref.id,
          param: r.params,
        }
        break
      case "trigger-def":
        Triggers[r.name] = {
          id: genId(),
          desc: r.desc,
          event: r.event,
          node: r,
        }
        break
      case "func-def": {
        const id = genId()
        Functions[r.name] = {
          fi: {
            id: id,
            ret: r.ret,
            param: r.params.map(p => ({
              id: genId(),
              name: p.name,
              type: p.type
            }))
          },
          id,
          desc: r.desc,
          node: r
        }
        break
      }
      case "act-def": {
        const id = genId()
        Actions[r.name] = {
          fi: {
            id: id,
            param: r.params.map(p => ({
              id: genId(),
              name: p.name,
              type: p.type
            }))
          },
          id,
          desc: r.desc,
          node: r
        }
        break
      }
    }
  })

  const root: XmlNode = {
    tag: "Root",
    attr: {},
    child: [],
  }

  TriggerData.child.push(root)

  for (const k in Triggers) {
    const t = Triggers[k]

    root.child.push({
      tag: "Item",
      attr: {
        Type: "Trigger",
        Id: t.id,
      },
      child: [],
    })
    TriggerStrings.push(`Trigger/Name/${t.id}=${t.desc}`)

    const context = new Context()

    const el = {
      tag: "Element",
      attr: {
        Type: "Trigger",
        Id: t.id,
      },
      child: [],
    }
    TriggerData.child.push(el)
    el.child.push(
      ...t.node.vars.map(v => {
        const { id, els } = VariableDefine(v, context)
        TriggerData.child.push(...els)
        context.variable[v.variable] = id
        return {
          tag: "Variable",
          attr: {
            Type: "Variable",
            Id: id,
          },
          child: [],
        }
      })
    )

    {
      const { id, els } = ExternalEvent(t.event)
      el.child.push({
        tag: "Event",
        attr: {
          Type: "FunctionCall",
          Id: id,
        },
        child: [],
      })
      TriggerData.child.push(...els)
    }

    t.node.statements.forEach(f => {
      const [e, els] = FunctionCall(context, f.params, f.func)
      el.child.push({
        tag: "Action",
        attr: {
          Type: "FunctionCall",
          Id: e.attr.Id,
        },
        child: [],
      })
      TriggerData.child.push(...els)
    })
  }

  for (const k in Functions) {
    const t = Functions[k]

    root.child.push({
      tag: "Item",
      attr: {
        Type: "FunctionDef",
        Id: t.id,
      },
      child: [],
    })
    TriggerStrings.push(`FunctionDef/Name/${t.id}=${t.desc}`)

    const context = new Context()

    const el = {
      tag: "Element",
      attr: {
        Type: "FunctionDef",
        Id: t.id,
      },
      child: [
        {
          tag: 'FlagCall',
          attr: {},
          child: []
        },
        {
          tag: 'ReturnType',
          attr: {},
          child: [
            {
              tag: 'Type',
              attr: {
                Value: TypeName[t.fi.ret]
              },
              child: []
            }
          ]
        }
      ],
    }
    TriggerData.child.push(el)
    el.child.push(
      ...t.node.params.map((v, i) => {
        const id = t.fi.param[i].id
        const { els } = ParamDefine(id, v, context)
        TriggerData.child.push(...els)
        context.param[v.name] = id
        return {
          tag: "Parameter",
          attr: {
            Type: "ParamDef",
            Id: id,
          },
          child: [],
        }
      })
    )

    el.child.push(
      ...t.node.vars.map(v => {
        const { id, els } = VariableDefine(v, context)
        TriggerData.child.push(...els)
        context.variable[v.variable] = id
        return {
          tag: "Variable",
          attr: {
            Type: "Variable",
            Id: id,
          },
          child: [],
        }
      })
    )

    t.node.statements.forEach(f => {
      const [e, els] = FunctionCall(context, f.params, f.func)
      el.child.push({
        tag: "FunctionCall",
        attr: {
          Type: "FunctionCall",
          Id: e.attr.Id,
        },
        child: [],
      })
      TriggerData.child.push(...els)
    })
  }

  for (const k in Actions) {
    const t = Actions[k]

    root.child.push({
      tag: "Item",
      attr: {
        Type: "FunctionDef",
        Id: t.id,
      },
      child: [],
    })
    TriggerStrings.push(`FunctionDef/Name/${t.id}=${t.desc}`)

    const context = new Context()

    const el = {
      tag: "Element",
      attr: {
        Type: "FunctionDef",
        Id: t.id,
      },
      child: [
        {
          tag: 'FlagAction',
          attr: {},
          child: []
        }
      ],
    }
    TriggerData.child.push(el)
    el.child.push(
      ...t.node.params.map((v, i) => {
        const id = t.fi.param[i].id
        const { els } = ParamDefine(id, v, context)
        TriggerData.child.push(...els)
        context.param[v.name] = id
        return {
          tag: "Parameter",
          attr: {
            Type: "ParamDef",
            Id: id,
          },
          child: [],
        }
      })
    )

    el.child.push(
      ...t.node.vars.map(v => {
        const { id, els } = VariableDefine(v, context)
        TriggerData.child.push(...els)
        context.variable[v.variable] = id
        return {
          tag: "Variable",
          attr: {
            Type: "Variable",
            Id: id,
          },
          child: [],
        }
      })
    )

    t.node.statements.forEach(f => {
      const [e, els] = FunctionCall(context, f.params, f.func)
      el.child.push({
        tag: "FunctionCall",
        attr: {
          Type: "FunctionCall",
          Id: e.attr.Id,
        },
        child: [],
      })
      TriggerData.child.push(...els)
    })
  }

  await fs.writeFile(
    "C:/Users/nekosu/Desktop/1.SC2Map/Triggers",
    '<?xml version="1.0" encoding="utf-8"?>' + saveXml(TriggerData)
  )
  await fs.writeFile(
    "C:/Users/nekosu/Desktop/1.SC2Map/zhCN.SC2Data/LocalizedData/GameStrings.txt",
    `DocInfo/DescLong=完全没有任何描述。
DocInfo/DescShort=任意
DocInfo/Name=这只是另一张《星际争霸II》地图
MapInfo/Player00/Name=中立
MapInfo/Player01/Name=玩家1
MapInfo/Player02/Name=敌对
` + GameStrings.join("\n")
  )
  await fs.writeFile(
    "C:/Users/nekosu/Desktop/1.SC2Map/zhCN.SC2Data/LocalizedData/TriggerStrings.txt",
    TriggerStrings.join("\n")
  )
}

main()
