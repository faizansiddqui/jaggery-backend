/**
 * Remove the /database segment from a MongoDB connection URI so the driver
 * does not implicitly pick a catalog from the string. The `dbName` option in
 * mongoose.connect() is then the single source of truth.
 *
 * Examples:
 * mongodb+srv://u:p@host.net/admin?appName=X → mongodb+srv://u:p@host.net/?appName=X
 * mongodb://u:p@h1:27017,h2:27017/ecommerce → mongodb://u:p@h1:27017,h2:27017/
 */
export function stripDatabasePathFromMongoUri(uri) {
  if (!uri || typeof uri !== "string") return uri;
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(\/?[^?]+)?(\?.*)?$/i);
  if (!m) return uri;
  const [, authority, pathSegment, query = ""] = m;
  if (!pathSegment || pathSegment === "/") return uri;
  return `${authority}/${query}`;
}
