import express from "express";
import bodyParser from "body-parser";
import sourcesRouter from "./routes/sources";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use("/sources", sourcesRouter);

app.listen(port, () => {
  console.log(`MCP Server running on port ${port}`);
});

export default app;
