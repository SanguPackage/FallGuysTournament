const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = Bun.file(`dist${path === "/" ? "/index.html" : path}`);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});

console.log(`Serving dist/ on ${server.url}`);
