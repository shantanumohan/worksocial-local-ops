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
  inboxPage,
  repairPage,
} from "./pages.js";
import {
  activationPage,
  connectionsPage,
  evidencePage,
  missionsPage,
  reviewDeskPage,
  sitesPage,
} from "./owner-pages.js";

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
          "M5 lead-capture + M4 owner staging + R1-02–R1-10 login/authority/mapping/roles/monitoring/knowledge/SEO/content/inbox/repair/learning",
        message:
          "Progressive console: activation → connections → sites → missions → review → evidence + M5 lead journeys. Not full React routes. Not R1-complete.",
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

    if (url.pathname === "/activation") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(activationPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/connections") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(connectionsPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/sites") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(sitesPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/missions") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(missionsPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/review") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(reviewDeskPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/evidence") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(evidencePage(options.apiOrigin));
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

    if (url.pathname === "/inbox") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(inboxPage(options.apiOrigin));
      return;
    }

    if (url.pathname === "/repair") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(repairPage(options.apiOrigin));
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  return server;
}
