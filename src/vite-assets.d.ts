// Vite asset imports (`?url`): the bundler replaces them with the emitted
// file's URL. Declared once so ts-jest and editors accept the worker import
// in src/lib/sign/reader.ts.
declare module '*?url' {
  const url: string;
  export default url;
}
