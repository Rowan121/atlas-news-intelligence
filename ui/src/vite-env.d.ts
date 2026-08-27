/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ATLAS_API_BASE_URL?: string;
  readonly VITE_ATLAS_INTELLIGENCE_PATH?: string;
  readonly VITE_MAP_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
