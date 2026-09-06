/** A flat key -> string map. Keys are dotted paths, e.g. `nav.sports`. */
export type Dictionary = Record<string, string>;

export type TranslateParams = Record<string, string | number>;

export type TranslateFn = (key: string, params?: TranslateParams) => string;
