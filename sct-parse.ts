import { SimpleParser } from "./parser.js"

interface AstNode {
  astType: string
}

export type AstNodeValue =
  | AstNodeString
  | AstNodeInt
  | AstNodeBool
  | AstNodeText
  | AstNodePreset
  | AstNodeVariableRefer
  | AstNodeFunctionCall

interface ExternalRefer {
  id: string
  lib: string
}

export interface AstNodeString extends AstNode {
  astType: "str-value"
  str: string
}

export interface AstNodeInt extends AstNode {
  astType: "int-value"
  int: number
}

export interface AstNodeBool extends AstNode {
  astType: "bool-value"
  bool: boolean
}

export interface AstNodeText extends AstNode {
  astType: "text-value"
  text: string
}

export interface AstNodePreset extends AstNode {
  astType: "preset-value"
  preset: string
  child: string
}

export interface AstNodeVariableRefer extends AstNode {
  astType: "var-ref"
  variable: string
}

export interface AstNodeFunctionCall extends AstNode {
  astType: "func-call"
  func: string
  params: AstNodeValue[]
}

export interface AstNodeActionCall extends AstNode {
  astType: "act-call"
  func: string
  params: AstNodeValue[]
}

export interface AstNodeEventCall extends AstNode {
  astType: "event-call"
  func: string
  params: AstNodeValue[]
}

export interface AstNodeVariableDefine {
  type: string
  variable: string
  value: AstNodeValue
}

export interface AstNodeParamDefine {
  type: string
  name: string
  // Maybe support default later
}

export interface AstNodeTriggerDefine extends AstNode {
  astType: "trigger-def"
  name: string
  desc: string
  event: AstNodeEventCall
  vars: AstNodeVariableDefine[]
  statements: AstNodeActionCall[]
}

export interface AstNodeFunctionDefine extends AstNode {
  astType: "func-def"
  name: string
  desc: string
  ret: string
  params: AstNodeParamDefine[]
  vars: AstNodeVariableDefine[]
  statements: AstNodeActionCall[]
}

export interface AstNodeActionDefine extends AstNode {
  astType: "act-def"
  name: string
  desc: string
  params: AstNodeParamDefine[]
  vars: AstNodeVariableDefine[]
  statements: AstNodeActionCall[]
}

export interface AstNodeExternalParamDefine {
  name: string
  type: string
  id: string
}

export interface AstNodeExternalEventDefine extends AstNode {
  astType: "external-event-def"
  func: string
  ref: ExternalRefer
  params: AstNodeExternalParamDefine[]
}

export interface AstNodeExternalFunctionDefine extends AstNode {
  astType: "external-func-def"
  func: string
  ref: ExternalRefer
  params: AstNodeExternalParamDefine[]
  ret: string
}

export interface AstNodeExternalActionDefine extends AstNode {
  astType: "external-act-def"
  func: string
  ref: ExternalRefer
  params: AstNodeExternalParamDefine[]
}

export interface AstNodeExternalPresetValueDefine {
  name: string
  id: string
}

export interface AstNodeExternalPresetDefine extends AstNode {
  astType: "external-preset-def"
  name: string
  lib: string
  value: AstNodeExternalPresetValueDefine[]
}

export interface AstNodeDeclareLibrary extends AstNode {
  astType: "declare-library"
  library: string
  name: string
}

export type AstNodeSection =
  | AstNodeDeclareLibrary
  | AstNodeTriggerDefine
  | AstNodeFunctionDefine
  | AstNodeActionDefine
  | AstNodeExternalFunctionDefine
  | AstNodeExternalActionDefine
  | AstNodeExternalEventDefine
  | AstNodeExternalPresetDefine

export interface NodeTypes {
  $预设: null
  $事件: null
  $函数: null
  $动作: null
  $触发器: null
  $库: null
  "$->": null
  "$;": null
  "$.": null
  "$,": null
  "${": null
  "$}": null
  "$[": null
  "$]": null
  "$(": null
  "$)": null
  "$<": null
  "$>": null
  "$:": null
  "$=": null
  $id: string
  $text: string
  $str: string
  $int: number
  $boolean: boolean
  $label: string

  program: AstNodeSection[]
  section: AstNodeSection

  value: AstNodeValue
  values: AstNodeValue[]

  statement: AstNodeActionCall
  statements: AstNodeActionCall[]

  DeclareLibrary: AstNodeDeclareLibrary
  TriggerDef: AstNodeTriggerDefine
  FunctionDef: AstNodeFunctionDefine
  ActionDef: AstNodeActionDefine
  VariableDef: AstNodeVariableDefine
  VariableDefs: AstNodeVariableDefine[]
  ParamDef: AstNodeParamDefine
  ParamDefs: AstNodeParamDefine[]

  ExternalParamDef: AstNodeExternalParamDefine
  ExternalParamDefs: AstNodeExternalParamDefine[]
  ExternalEventDef: AstNodeExternalEventDefine
  ExternalFunctionDef: AstNodeExternalFunctionDefine
  ExternalActionDef: AstNodeExternalActionDefine
  ExternalPresetDef: AstNodeExternalPresetDefine
  ExternalPresetValueDef: AstNodeExternalPresetValueDefine
  ExternalPresetValueDefs: AstNodeExternalPresetValueDefine[]
}

export function CreateParser() {
  const parser = new SimpleParser<NodeTypes>(
    /[ \n\r\t]+/,
    {
      $id: /[0-9a-fA-F]{8}/,
      $text: /文本"[\s\S]+?"/,
      $str: /"[\s\S]+?"/,
      $int: /-?\d+/,
      $boolean: /[真假]/,
      $label:
        /[\p{Unified_Ideograph}a-zA-Z_][\p{Unified_Ideograph}a-zA-Z0-9_]*/u,
    },
    {
      $id: s => s.toUpperCase(),
      $text: s => s.substring(3, s.length - 1),
      $str: s => s.substring(1, s.length - 1),
      $int: parseInt,
      $boolean: b => b === "真",
    },
    [
      "$预设",
      "$函数",
      "$事件",
      "$函数",
      "$动作",
      "$触发器",
      "$库",
      "$->",
      "$;",
      "$.",
      "$,",
      "${",
      "$}",
      "$[",
      "$]",
      "$(",
      "$)",
      "$<",
      "$>",
      "$:",
      "$=",
    ]
  )

  parser.rule
    .entry("program")
    .with(r => r._some("program", "section"))
    .for("section")
    .sameas(
      "DeclareLibrary",
      "TriggerDef",
      "FunctionDef",
      "ActionDef",
      "ExternalEventDef",
      "ExternalFunctionDef",
      "ExternalActionDef",
      "ExternalPresetDef"
    )

    .for("DeclareLibrary")
    .when("$库", "$str", "$str")
    .do((_, library, name) => ({
      astType: "declare-library",
      library,
      name,
    }))

    .for("TriggerDef")
    .when(
      "$触发器",
      "$label",
      "$str",
      "$label",
      "$(",
      "values",
      "$)",
      "VariableDefs",
      "${",
      "statements",
      "$}"
    )
    .do((_, name, desc, event, _2, eventParam, _3, vars, _4, statements) => ({
      astType: "trigger-def",
      name,
      desc,
      event: {
        astType: "event-call",
        func: event,
        params: eventParam,
      },
      vars,
      statements,
    }))

    .for("FunctionDef")
    .when(
      "$函数",
      "$label",
      "$str",
      "$->",
      "$label",
      "$(",
      "ParamDefs",
      "$)",
      "VariableDefs",
      "${",
      "statements",
      "$}"
    )
    .do((_, name, desc, _2, ret, _3, params, _4, vars, _5, statements) => ({
      astType: "func-def",
      name,
      desc,
      ret,
      params,
      vars,
      statements,
    }))

    .for("ActionDef")
    .when(
      "$动作",
      "$label",
      "$str",
      "$(",
      "ParamDefs",
      "$)",
      "VariableDefs",
      "${",
      "statements",
      "$}"
    )
    .do((_, name, desc, _2, params, _3, vars, _4, statements) => ({
      astType: "act-def",
      name,
      desc,
      params,
      vars,
      statements,
    }))

    .with(r => r._some("VariableDefs", "VariableDef"))
    .for("VariableDef")
    .when("$label", "$label", "$=", "value")
    .do((type, variable, _, value) => ({
      type,
      variable,
      value,
    }))

    .with(r => r._some_sep("ParamDefs", "ParamDef", "$,"))
    .for("ParamDef")
    .when("$label", "$:", "$label")
    .do((name, _, type) => ({
      name,
      type,
    }))

    .with(r => r._some_sep("ExternalParamDefs", "ExternalParamDef", "$,"))
    .for("ExternalParamDef")
    .when("$label", "$:", "$label", "$=", "$id")
    .do((name, _, type, _2, id) => ({
      name,
      type,
      id,
    }))

    .for("ExternalEventDef")
    .when(
      "$事件",
      "$<",
      "$label",
      "$>",
      "$label",
      "$=",
      "$id",
      "$(",
      "ExternalParamDefs",
      "$)",
      "$;"
    )
    .do((_, _2, lib, _3, func, _4, id, _5, params) => ({
      astType: "external-event-def",
      func,
      ref: {
        lib,
        id,
      },
      params,
    }))

    .for("ExternalFunctionDef")
    .when(
      "$函数",
      "$<",
      "$label",
      "$>",
      "$label",
      "$=",
      "$id",
      "$(",
      "ExternalParamDefs",
      "$)",
      "$->",
      "$label",
      "$;"
    )
    .do((_, _2, lib, _3, func, _4, id, _5, params, _6, _7, ret) => ({
      astType: "external-func-def",
      func,
      ref: {
        lib,
        id,
      },
      params,
      ret,
    }))

    .for("ExternalActionDef")
    .when(
      "$动作",
      "$<",
      "$label",
      "$>",
      "$label",
      "$=",
      "$id",
      "$(",
      "ExternalParamDefs",
      "$)",
      "$;"
    )
    .do((_, _2, lib, _3, func, _4, id, _5, params) => ({
      astType: "external-act-def",
      func,
      ref: {
        lib,
        id,
      },
      params,
    }))

    .for("ExternalPresetDef")
    .when(
      "$预设",
      "$<",
      "$label",
      "$>",
      "$label",
      "${",
      "ExternalPresetValueDefs",
      "$}"
    )
    .do((_, _2, lib, _3, name, _4, value) => ({
      astType: "external-preset-def",
      name,
      lib,
      value,
    }))
    .with(r => r._some("ExternalPresetValueDefs", "ExternalPresetValueDef"))
    .for("ExternalPresetValueDef")
    .when("$label", "$:", "$id")
    .do((name, _, id) => ({
      name,
      id,
    }))

    .with(r => r._some("statements", "statement"))
    .for("statement")
    .when("$label", "$(", "values", "$)", "$;")
    .do((func, _, params) => ({
      astType: "act-call",
      func,
      params,
    }))

    .with(r => r._some_sep("values", "value", "$,"))
    .for("value")
    .when("$text")
    .do(text => ({
      astType: "text-value",
      text,
    }))
    .when("$str")
    .do(str => ({
      astType: "str-value",
      str,
    }))
    .when("$int")
    .do(int => ({
      astType: "int-value",
      int,
    }))
    .when("$boolean")
    .do(bool => ({
      astType: "bool-value",
      bool,
    }))
    .when("$label", "$.", "$label")
    .do((preset, _, child) => ({
      astType: "preset-value",
      preset,
      child,
    }))
    .when("$label")
    .do(variable => ({
      astType: "var-ref",
      variable,
    }))
    .when("$label", "$(", "values", "$)")
    .do((func, _, params) => ({
      astType: "func-call",
      func,
      params,
    }))

  return parser
}
