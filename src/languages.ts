/** Rough language groups by file extension. Themes pick a color for each group. */
export type LanguageGroup =
  | "script" // JS / TS
  | "python"
  | "systems" // C, C++, Rust, Go, Zig
  | "jvm" // Java, Kotlin, Scala
  | "web" // HTML, CSS, Vue, Svelte
  | "shell"
  | "data" // JSON, YAML, TOML, CSV, SQL
  | "docs" // Markdown, text, reStructuredText
  | "media" // images, fonts, audio
  | "other";

const GROUPS: Record<string, LanguageGroup> = {};
const add = (group: LanguageGroup, exts: string[]) => exts.forEach((ext) => (GROUPS[ext] = group));

add("script", ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"]);
add("python", ["py", "pyi", "ipynb"]);
add("systems", ["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "rs", "go", "zig", "swift", "m", "mm", "cs"]);
add("jvm", ["java", "kt", "kts", "scala", "groovy", "gradle", "clj"]);
add("web", ["html", "htm", "css", "scss", "sass", "less", "vue", "svelte", "astro", "php", "rb", "erb"]);
add("shell", ["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"]);
add("data", ["json", "yaml", "yml", "toml", "ini", "xml", "csv", "sql", "lock", "proto", "graphql"]);
add("docs", ["md", "mdx", "txt", "rst", "adoc", "tex"]);
add("media", ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "ttf", "otf", "woff", "woff2", "mp3", "wav", "mp4"]);

export function languageOf(path: string): LanguageGroup {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "other";
  return GROUPS[base.slice(dot + 1)] ?? "other";
}
