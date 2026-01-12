declare module 'launch-editor' {
  function launchEditor(
    fileName: string,
    preferredEditor?: string,
    callback?: (fileName: string, errorMsg: string | null) => void
  ): void;
  
  export = launchEditor;
}
