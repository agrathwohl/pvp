#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("pvp-server")
  .description("Start the PVP WebSocket server")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-h, --host <host>", "Host to bind to", "0.0.0.0")
  .action(async (options) => {
    const { startServer } = await import("../dist/server/index.js");
    await startServer({ port: parseInt(options.port), host: options.host });
  });

program.parse();
