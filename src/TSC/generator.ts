import fs from 'fs/promises'
import { saveXml, XmlNode } from './xml.js'
import * as Ast from './types.js'
import * as TSC from './tsc-parser.js'
import * as TSD from './tsd-parser.js'
import { deflate as _deflate, inflate as _inflate } from 'zlib'
import { promisify } from 'util'
import { StringManager } from './strings.js'
const deflate = promisify(_deflate)
const inflate = promisify(_inflate)

class XmlNodeList {
  data: XmlNode[]

  constructor() {
    this.data = []
  }

  alloc(tag: string): XmlNode {
    const el = {
      tag,
      attr: {},
      child: [],
    }
    this.data.push(el)
    return el
  }
}

function tranLib(s: string) {
  return s === '0' ? undefined : s
}

function ref(el: Ast.Element) {
  return {
    Id: el.id,
    Library: tranLib(el.lib),
  }
}

const TypeName = {
  文本: 'text',
  字符串: 'string',
  整数: 'int',
  布尔: 'bool',
}

class AttrHelper {
  value: Record<string, string | true>

  constructor(attr?: Ast.Attribute) {
    this.value = {}
    attr?.forEach(a => {
      this.value[a.key] = a.value || true
    })
  }

  has(key: string) {
    return key in this.value
  }
}

class Context {
  program: Program
  lib: string
  param: Record<string, string>
  variable: Record<string, string>
  element: XmlNodeList

  constructor(p: Program) {
    this.program = p
    this.lib = ''
    this.param = {}
    this.variable = {}
    this.element = new XmlNodeList()
  }

  queryVariable(name: string) {
    if (name in this.variable) {
      return {
        id: this.variable[name],
        lib: this.lib,
      }
    } else if (name in this.program.variable) {
      return this.program.variable[name]
    }
    return undefined
  }

  queryParam(name: string) {
    if (name in this.param) {
      return {
        id: this.param[name],
        lib: this.lib,
      }
    } else {
      throw [`Unknown variable ${name}`]
    }
  }

  createType(name: string, flag?: Ast.Attribute) {
    let els: XmlNode[] = null
    const fh = new AttrHelper(flag)
    if (name in TypeName) {
      els = [
        {
          tag: 'Type',
          attr: {
            Value: TypeName[name],
          },
          child: [],
        },
      ]
    } else if (name in this.program.preset) {
      els = [
        {
          tag: 'Type',
          attr: {
            Value: 'preset',
          },
          child: [],
        },
        {
          tag: 'TypeElement',
          attr: {
            Type: 'Preset',
            ...ref(this.program.preset[name]),
          },
          child: [],
        },
      ]
    } else {
      throw [`Unknown type ${name}`]
    }
    if (fh.has('const')) {
      els.push({
        tag: 'Constant',
        attr: {},
        child: [],
      })
    }
    return els
  }

  createArrayType(type: Ast.ArrayType, flag?: Ast.Attribute) {
    const els = this.createType(type.type, flag)
    type.dims.forEach((d, i) => {
      switch (d._type) {
        case 'direct-value':
          els.push({
            tag: 'ArraySize',
            attr: {
              Dim: i.toString(),
              Value: d.value.toString(),
            },
            child: [],
          })
          break
        case 'var-refer':
          els.push({
            tag: 'ArraySize',
            attr: {
              Dim: i.toString(),
              Type: 'Variable',
              ...ref(this.program.variable[d.name]),
            },
            child: [],
          })
          break
      }
    })
    return els
  }

  createParam(val: Ast.Value, def?: Ast.ParamDefine) {
    const el = this.element.alloc('Element')
    el.attr = {
      Type: 'Param',
      Id: val.id,
    }
    if (def) {
      el.child.push({
        tag: 'ParameterDef',
        attr: {
          Type: 'ParamDef',
          ...ref(def),
        },
        child: [],
      })
    }
    switch (val._type) {
      case 'direct-value':
        if (['string', 'boolean', 'int'].includes(val.vtype)) {
          el.child.push({
            tag: 'Value',
            attr: {},
            child: [
              {
                tag: '#text',
                attr: {
                  text: val.value.toString(),
                },
                child: [],
              },
            ],
          })
        }
        el.child.push({
          tag: 'ValueType',
          attr: {
            Type: val.vtype,
          },
          child: [],
        })
        break
      case 'var-refer':
        if (this.queryVariable(val.name)) {
          el.child.push({
            tag: 'Variable',
            attr: {
              Type: 'Variable',
              ...ref(this.queryVariable(val.name)),
            },
            child: [],
          })
        } else if (this.queryParam(val.name)) {
          el.child.push({
            tag: 'Parameter',
            attr: {
              Type: 'ParamDef',
              ...ref(this.queryParam(val.name)),
            },
            child: [],
          })
        } else {
          throw [`Unknown variable ${val.name}`]
        }
        break
      case 'var-array-refer':
        if (this.queryVariable(val.name)) {
          el.child.push({
            tag: 'Variable',
            attr: {
              Type: 'Variable',
              ...ref(this.queryVariable(val.name)),
            },
            child: [],
          })
        } else if (this.queryParam(val.name)) {
          el.child.push({
            tag: 'Parameter',
            attr: {
              Type: 'ParamDef',
              ...ref(this.queryVariable(val.name)),
            },
            child: [],
          })
        } else {
          throw [`Unknown variable ${val.name}`]
        }
        val.dims.forEach(d => {
          el.child.push({
            tag: 'Array',
            attr: {
              Type: 'Param',
              ...ref(d),
            },
            child: [],
          })
          this.createParam(d)
        })
        break
      case 'preset-value': {
        const pl = this.program.preset[val.preset].item.find(
          item => item.name === val.item
        )
        el.child.push({
          tag: 'Preset',
          attr: {
            Type: 'PresetValue',
            ...ref(pl),
          },
          child: [],
        })
        break
      }
      case 'call-value':
        el.child.push({
          tag: 'FunctionCall',
          attr: {
            Type: 'FunctionCall',
            ...ref(val.call),
          },
          child: [],
        })
        this.createFunctionCall(val.call)
        break
    }
  }

  createVariableDef(vd: Ast.VariableDefine) {
    const el = this.element.alloc('Element')
    el.attr = {
      Type: 'Variable',
      Id: vd.id,
    }
    el.child.push({
      tag: 'VariableType',
      attr: {},
      child: [...this.createArrayType(vd.type, vd.flag)],
    })
    el.child.push({
      tag: 'Value',
      attr: {
        Type: 'Param',
        ...ref(vd.value),
      },
      child: [],
    })
    this.createParam(vd.value)
  }

  createParamDef(pd: Ast.ParamDefine) {
    const el = this.element.alloc('Element')
    el.attr = {
      Type: 'ParamDef',
      Id: pd.id,
    }
    el.child.push({
      tag: 'ParameterType',
      attr: {},
      child: [...this.createType(pd.type)],
    })
    if (pd.def) {
      el.child.push({
        tag: 'Default',
        attr: {
          Type: 'Param',
          ...ref(pd.def),
        },
        child: [],
      })
      this.createParam(pd.def)
    }
  }

  createFunctionCall(fc: Ast.FunctionCall, sft?: Ast.ParamDefine) {
    const el = this.element.alloc('Element')
    el.attr = {
      Type: 'FunctionCall',
      Id: fc.id,
    }
    const fi = this.program.function[fc.func]
    el.child.push({
      tag: 'FunctionDef',
      attr: {
        Type: 'FunctionDef',
        ...ref(fi),
      },
      child: [],
    })
    if (sft) {
      el.child.push({
        tag: 'SubFunctionType',
        attr: {
          Type: 'SubFuncType',
          ...ref(sft),
        },
        child: [],
      })
    }
    fc.param.forEach((p, i) => {
      if (p._type === 'block') {
        p.prog.forEach(s => {
          el.child.push({
            tag: 'FunctionCall',
            attr: {
              Type: 'FunctionCall',
              ...ref(s),
            },
            child: [],
          })
          this.createFunctionCall(s, fi.params[i])
        })
      } else {
        el.child.push({
          tag: 'Parameter',
          attr: {
            Type: 'Param',
            ...ref(p),
          },
          child: [],
        })
        this.createParam(p, fi.params[i])
      }
    })
  }

  buildItem(item: Ast.DFolder | string) {
    if (typeof item === 'string') {
      this.variable = {}
      if (item in this.program.trigger) {
        const obj = this.program.trigger[item]
        const el = this.element.alloc('Element')
        el.attr = {
          Type: 'Trigger',
          Id: obj.id,
        }
        el.child.push({
          tag: 'Identifier',
          attr: {},
          child: [
            {
              tag: '#text',
              attr: {
                text: item,
              },
              child: [],
            },
          ],
        })
        el.child.push({
          tag: 'Event',
          attr: {
            Type: 'FunctionCall',
            ...ref(obj.event),
          },
          child: [],
        })
        this.createFunctionCall(obj.event)
        obj.vars.forEach(v => {
          this.variable[v.name] = v.id
          el.child.push({
            tag: 'Variable',
            attr: {
              Type: 'Variable',
              ...ref(v),
            },
            child: [],
          })
          this.createVariableDef(v)
        })
        obj.prog.prog.forEach(p => {
          el.child.push({
            tag: 'Action',
            attr: {
              Type: 'FunctionCall',
              ...ref(p),
            },
            child: [],
          })
          this.createFunctionCall(p)
        })
        return {
          tag: 'Item',
          attr: {
            Type: 'Trigger',
            ...ref(obj),
          },
          child: [],
        }
      } else if (item in this.program.function) {
        const obj = this.program.function[item] as Ast.FunctionDefine
        const el = this.element.alloc('Element')
        el.attr = {
          Type: 'FunctionDef',
          Id: obj.id,
        }
        el.child.push({
          tag: 'Identifier',
          attr: {},
          child: [
            {
              tag: '#text',
              attr: {
                text: item,
              },
              child: [],
            },
          ],
        })
        const fh = new AttrHelper(obj.flag)
        if (fh.has('func')) {
          el.child.push({
            tag: 'FlagCall',
            attr: {},
            child: [],
          })
        } else if (fh.has('action')) {
          el.child.push({
            tag: 'FlagAction',
            attr: {},
            child: [],
          })
        }
        if (obj.ret !== 'void') {
          el.child.push({
            tag: 'ReturnType',
            attr: {},
            child: [...this.createType(obj.ret)],
          })
        }
        obj.params.forEach(p => {
          this.param[p.name] = p.id
          el.child.push({
            tag: 'Parameter',
            attr: {
              Type: 'ParamDef',
              ...ref(p),
            },
            child: [],
          })
          this.createParamDef(p)
        })
        obj.vars.forEach(v => {
          this.variable[v.name] = v.id
          el.child.push({
            tag: 'Variable',
            attr: {
              Type: 'Variable',
              ...ref(v),
            },
            child: [],
          })
          this.createVariableDef(v)
        })
        obj.prog.prog.forEach(p => {
          el.child.push({
            tag: 'FunctionCall',
            attr: {
              Type: 'FunctionCall',
              ...ref(p),
            },
            child: [],
          })
          this.createFunctionCall(p)
        })
        return {
          tag: 'Item',
          attr: {
            Type: 'FunctionDef',
            ...ref(obj),
          },
          child: [],
        }
      } else if (item in this.program.preset) {
        const obj = this.program.preset[item]
        const el = this.element.alloc('Element')
        el.attr = {
          Type: 'Preset',
          Id: obj.id,
        }
        el.child.push(
          {
            tag: 'PresetInteger',
            attr: {},
            child: [],
          },
          {
            tag: 'BaseType',
            attr: {
              Value: 'int',
            },
            child: [],
          },
          {
            tag: 'PresetGenConstVar',
            attr: {},
            child: [],
          }
        )
        obj.item.forEach(it => {
          el.child.push({
            tag: 'Item',
            attr: {
              Type: 'PresetValue',
              ...ref(it),
            },
            child: [],
          })
          const e = this.element.alloc('Element')
          e.attr = {
            Type: 'PresetValue',
            Id: it.id,
          }
        })
        return {
          tag: 'Item',
          attr: {
            Type: 'Preset',
            ...ref(obj),
          },
          child: [],
        }
      } else if (item in this.program.variable) {
        const obj = this.program.variable[item] as Ast.GlobalVariableDefine
        this.createVariableDef(obj)
        return {
          tag: 'Item',
          attr: {
            Type: 'Variable',
            ...ref(obj),
          },
          child: [],
        }
      }
    } else {
      const el = this.element.alloc('Element')
      el.attr = {
        Type: 'Category',
        Id: item.id,
      }
      el.child = item.item.map(it => this.buildItem(it))
      return {
        tag: 'Item',
        attr: {
          Type: 'Category',
          Libraray: tranLib(this.lib),
          Id: item.id,
        },
        child: [],
      }
    }
  }

  build(lib: Ast.DLibrary) {
    this.lib = lib.name
    const root = this.element.alloc('Root')
    lib.item.forEach(it => {
      root.child.push(this.buildItem(it))
    })
  }
}

export class Program {
  ID: Record<string, number>

  sm: StringManager
  preset: Record<string, Ast.PresetInfo>
  function: Record<string, Ast.FunctionInfo>
  trigger: Record<string, Ast.TriggerDefine>
  variable: Record<string, Ast.VariableInfo>

  constructor() {
    this.sm = new StringManager()
    this.sm.ts['DocInfo/DescLong'] = '完全没有任何描述。'
    this.sm.ts['DocInfo/DescShort'] = '任意'
    this.sm.ts['DocInfo/Name'] = '这只是另一张《星际争霸II》地图'
    this.sm.ts['MapInfo/Player00/Name'] = '中立'
    this.sm.ts['MapInfo/Player01/Name'] = '玩家1'
    this.sm.ts['MapInfo/Player02/Name'] = '敌对'
    this.ID = {}
    this.trigger = {}
    this.preset = {}
    this.function = {}
    this.variable = {}
  }

  gen(lib: string) {
    if (!(lib in this.ID)) {
      this.ID[lib] = 0x10000000
    }
    return (++this.ID[lib]).toString(16).toUpperCase().padStart(8)
  }

  put(type: string, key: string, text: string) {
    switch (type) {
      case 'ts':
        this.sm.ts[key] = text
        break
      case 'gs':
        this.sm.gs[key] = text
        break
    }
  }

  async load(sct_path: string) {
    const cachePath = `${sct_path}.cache`
    let loadCache = false
    let p: Ast.Program = null
    try {
      const st = await fs.stat(cachePath)
      const sts = await fs.stat(sct_path)
      if (st.isFile() && st.mtime > sts.mtime) {
        loadCache = true
      }
    } catch (e) {}
    if (loadCache) {
      console.log(`Using ${cachePath}`)
      p = JSON.parse(
        (await inflate(await fs.readFile(cachePath))).toString()
      ) as Ast.Program
    } else {
      const buf = (await fs.readFile(sct_path)).toString()
      try {
        p = TSC.CreateParser().parse(buf)
      } catch ([msg]) {
        throw msg
      }
      await fs.writeFile(`${sct_path}.cache`, await deflate(JSON.stringify(p)))
    }
    TSC.GenerateId(
      p,
      (lib: string) => {
        return this.gen(lib)
      },
      (type, key, text) => {
        this.put(type, key, text)
      }
    )
    p.forEach(scope => {
      switch (scope._type) {
        case 'import':
          scope.define.forEach(d => {
            switch (d._type) {
              case 'ext-func-def':
                this.function[d.name] = d
                break
              case 'ext-preset-def':
                this.preset[d.name] = d
                break
              case 'ext-var-def':
                this.variable[d.name] = d
                break
            }
          })
          break
        case 'library':
          scope.define.forEach(d => {
            switch (d._type) {
              case 'trigger-def':
                this.trigger[d.name] = d
                break
              case 'func-def':
                this.function[d.name] = d
                break
              case 'preset-def':
                this.preset[d.name] = d
                break
              case 'var-def':
                this.variable[d.name] = d
                break
            }
          })
          break
      }
    })
  }

  async generate(scd_path: string, dir: string, locale: string) {
    const buf = (await fs.readFile(scd_path)).toString()
    let libs: Ast.DLibrary[] = []
    try {
      libs = TSD.CreateParser().parse(buf)
    } catch ([msg]) {
      throw msg
    }
    TSD.GenerateId(
      libs,
      (lib: string) => {
        return this.gen(lib)
      },
      (type, key, text) => {
        this.put(type, key, text)
      }
    )

    const result = {
      tag: 'TriggerData',
      attr: {},
      child: [],
    }

    libs.forEach(lib => {
      const ctx = new Context(this)
      ctx.build(lib)
      if (lib.name === '0') {
        result.child.push(...ctx.element.data)
      } else {
        result.child.push({
          tag: 'Library',
          attr: {
            Id: lib.name,
          },
          child: ctx.element.data,
        })
      }
    })

    await fs.writeFile(`${dir}/Triggers`, saveXml(result))
    await this.sm.save(dir, locale)
  }
}
