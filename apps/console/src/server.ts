import { createServer, type Server } from "node:http";
import {
  authorityPage,
  knowledgePage,
  learningPage,
  loginPage,
  mappingPage,
  monitoringPage,
  rolesPage,
  seoPage,
  contentPage,
} from "./pages.js";

export type ConsoleServerOptions = {
  port: number;
  apiOrigin: string;
};

export function startConsoleServer(options: ConsoleServerOptions): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${options.port}`);

    if (url.pathname === "/health") {
      const body = JSON.stringify({
        serviceId: "console",
        status: "running",
        productionActivated: false,
        identity:
          "R1-02–R1-08 login + authority + mapping + roles + monitoring + knowledge + SEO + content + learning",
        message: "Minimal console surface; not full React routes.",
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/login") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(loginPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/authority") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(authorityPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/mapping") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(mappingPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/roles") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(rolesPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/learning") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(learningPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/monitoring") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(monitoringPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/knowledge") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(knowledgePage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/seo") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(seoPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/content") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(contentPage(options.apiOrigin));
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  return server;
}
