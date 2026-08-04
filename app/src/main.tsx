import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Inter self-hosted (nessuna chiamata a Google Fonts): solo i pesi usati nel
// design Figma (Regular/Medium/Semi Bold/Bold).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";
import App from "./App.tsx";
import { assertEnv } from "./lib/env.ts";

assertEnv();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
