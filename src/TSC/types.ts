export interface Node {
  _type: string
}

export interface Element {
  lib?: string
  id?: string
}

export type Value =
  | DirectText
  | DirectString
  | DirectInt
  | DirectBoolean
  | PresetValue
  | VariableRefer
  | FunctionCallValue

export interface DirectValue extends Node, Element {
  _type: "direct-value"
  vtype: string
}

export interface DirectText extends DirectValue {
  vtype: "text"
  value: string
}

export interface DirectString extends DirectValue {
  vtype: "string"
  value: string
}

export interface DirectInt extends DirectValue {
  vtype: "int"
  value: number
}

export interface DirectBoolean extends DirectValue {
  vtype: "boolean"
  value: boolean
}

export interface PresetValue extends Node, Element {
  _type: "preset-value"
  preset: string
  item: string
}

export interface VariableRefer extends Node, Element {
  _type: "var-refer"
  name: string
}

export interface FunctionCallValue extends Node, Element {
  _type: "call-value"
  call: FunctionCall
}

export interface FunctionCall extends Node, Element {
  _type: "call"
  func: string
  param: Value[]
}

export interface AttributeItem {
  key: string
  value?: string
}

export type Attribute = AttributeItem[]

export interface VariableInfo extends Element {
  type: string
  name: string
  flag: Attribute
}

export interface VariableDefine extends VariableInfo {
  value: Value
}

export interface GlobalVariableDefine extends Node, VariableDefine {
  _type: 'var-def'
  desc: string
  value: Value
}

export interface ExternalVariableDefine extends Node, VariableInfo {
  _type: 'ext-var-def'
}

export interface ParamDefine extends Element {
  type: string
  name: string
}

export interface TriggerDefine extends Node, Element {
  _type: "trigger-def"
  name: string
  desc: string
  flag: Attribute
  event: FunctionCall
  vars: VariableDefine[]
  prog: FunctionCall[]
}

export interface PresetItem extends Element {
  name: string
}

export interface PresetInfo extends Node, Element {
  name: string
  flag: Attribute
  item: PresetItem[]
}

export interface PresetDefine extends PresetInfo {
  _type: "preset-def"
  desc: string
}

export interface ExternalPresetDefine extends PresetInfo {
  _type: "ext-preset-def"
}

export interface FunctionInfo extends Node, Element {
  name: string
  flag: Attribute
  ret: string
  params: ParamDefine[]
}

export interface FunctionDefine extends FunctionInfo {
  _type: "func-def"
  desc: string
  vars: VariableDefine[]
  prog: FunctionCall[]
}

export interface ExternalFunctionDefine extends FunctionInfo {
  _type: "ext-func-def"
}

export interface Category extends Node, Element {
  _type: "category"
  desc: string
  item: (string | Category)[]
}

export type ImportDefine = ExternalPresetDefine | ExternalVariableDefine | ExternalFunctionDefine
export type LibraryDefine = PresetDefine | GlobalVariableDefine | FunctionDefine | TriggerDefine

export interface ImportScope extends Node {
  _type: "import"
  library: string
  define: ImportDefine[]
}

export interface LibraryScope extends Node {
  _type: "library"
  library: string
  define: LibraryDefine[]
}

export type Scope = LibraryScope | ImportScope
export type Program = Scope[]

export interface DLibrary {
  name: string
  desc: string
  item: (DFolder | string)[]
}

export interface DFolder {
  id?: string
  desc: string
  item: (DFolder | string)[]
}
