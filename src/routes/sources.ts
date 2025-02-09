import express, { Request, Response } from "express";
import { existsSync, readFileSync, writeFileSync, watch } from "fs";
import path from "path";

const router = express.Router();

// Optional configuration: external file for storing sources
const sourcesFilePath = process.env.SOURCES_FILE_PATH || "";

// Function to load sources from the external file if provided
function loadSources() {
  if (sourcesFilePath && existsSync(sourcesFilePath)) {
    try {
      const data = readFileSync(sourcesFilePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error parsing sources file:", error);
      return [];
    }
  }
  return [];
}

// Function to save sources to the external file if provided
function saveSources(sources: any[]) {
  if (sourcesFilePath) {
    try {
      writeFileSync(sourcesFilePath, JSON.stringify(sources, null, 2));
    } catch (error) {
      console.error("Error writing to sources file:", error);
    }
  }
}

// Initialize sources - either from file or an in-memory empty array
let sources: Array<any> = loadSources();

// Watch the external sources file for changes and reload sources
if (sourcesFilePath) {
  watch(sourcesFilePath, (eventType, filename) => {
    if (eventType === "change") {
      console.log(
        `Sources file changed. Reloading sources from ${sourcesFilePath}.`
      );
      sources = loadSources();
    }
  });
}

// GET /sources: Retrieve all sources
router.get("/", (req: Request, res: Response) => {
  res.json(sources);
});

// POST /sources: Add a new source
router.post("/", (req: Request, res: Response) => {
  const newSource = req.body;
  // For simplicity, require an 'id' property in newSource
  if (!newSource.id) {
    res.status(400).json({ message: "Source must have an id" });
    return;
  }
  sources.push(newSource);
  saveSources(sources);
  res.status(201).json({ message: "Source added", source: newSource });
});

// PUT /sources/:id: Update an existing source
router.put("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const updatedSource = req.body;
  const index = sources.findIndex((src) => src.id === id);
  if (index === -1) {
    res.status(404).json({ message: "Source not found" });
    return;
  }
  sources[index] = { ...sources[index], ...updatedSource };
  saveSources(sources);
  res.json({ message: "Source updated", source: sources[index] });
});

// DELETE /sources/:id: Remove a source
router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const index = sources.findIndex((src) => src.id === id);
  if (index === -1) {
    res.status(404).json({ message: "Source not found" });
    return;
  }
  const removed = sources.splice(index, 1);
  saveSources(sources);
  res.json({ message: "Source removed", source: removed[0] });
});

export default router;
