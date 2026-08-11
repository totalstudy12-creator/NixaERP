/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE: string;
    // add more env variables here if needed
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
