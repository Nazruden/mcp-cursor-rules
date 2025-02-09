import express from "express";
import bodyParser from "body-parser";
import sourcesRouter from "./routes/sources";
import monitoringRoutes from "./routes/monitoring";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use("/sources", sourcesRouter);
app.use("/monitoring", monitoringRoutes);

app.listen(port, () => {
  console.log(`MCP Server running on port ${port}`);
});

export default app;
