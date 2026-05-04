import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import "./styles/components.css";
import { useAuthStore } from "./store/authStore";

useAuthStore.getState().bootstrap().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
});
