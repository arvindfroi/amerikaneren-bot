/** `node:path` i nettleseren: bare det `src/` bruker (`join`, `dirname`, `basename`). */
export const join = (...d: string[]): string => d.filter((x) => x !== "").join("/").replace(/\/+/g, "/");
export const dirname = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "." : p.slice(0, i);
};
export const basename = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
export const resolve = join;
export default { join, dirname, basename, resolve };
