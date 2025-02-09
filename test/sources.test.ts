import request from "supertest";
import type { Application } from "express";
import app from "../src/app";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import sourcesRouter from "../src/routes/sources";

// Cast the imported app to an Express instance
const testApp = app as Application;

describe("Sources API", () => {
  const sourceId = "test-source";
  const TEST_SOURCES_FILE = join(tmpdir(), "test-sources.json");

  // Setup and teardown for file-based tests
  beforeEach(async () => {
    // Reset sources array and environment
    process.env.SOURCES_FILE_PATH = TEST_SOURCES_FILE;
    if (existsSync(TEST_SOURCES_FILE)) {
      unlinkSync(TEST_SOURCES_FILE);
    }
    writeFileSync(TEST_SOURCES_FILE, "[]");

    // Reset the router state
    await (sourcesRouter as any).reset();
  });

  afterEach(async () => {
    // Clean up file watchers and state
    (sourcesRouter as any).cleanup();

    delete process.env.SOURCES_FILE_PATH;
    if (existsSync(TEST_SOURCES_FILE)) {
      unlinkSync(TEST_SOURCES_FILE);
    }
  });

  describe("Basic CRUD Operations", () => {
    it("should return an empty array initially", async () => {
      const res = await request(testApp).get("/sources");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it("should add a new source via POST", async () => {
      const newSource = { id: sourceId, name: "Test Source" };
      const res = await request(testApp).post("/sources").send(newSource);
      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Source added");
      expect(res.body.source).toEqual(newSource);
    });

    it("should update the source via PUT", async () => {
      // First add the source
      const source = { id: sourceId, name: "Test Source" };
      await request(testApp).post("/sources").send(source);

      const updatedSource = { name: "Updated Test Source" };
      const res = await request(testApp)
        .put(`/sources/${sourceId}`)
        .send(updatedSource);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Source updated");
      expect(res.body.source.name).toBe("Updated Test Source");
    });

    it("should delete the source via DELETE", async () => {
      // First add the source
      const source = { id: sourceId, name: "Test Source" };
      await request(testApp).post("/sources").send(source);

      const res = await request(testApp).delete(`/sources/${sourceId}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Source removed");
    });
  });

  describe("Error Handling", () => {
    it("should return 400 when trying to add a source without an id", async () => {
      const res = await request(testApp)
        .post("/sources")
        .send({ name: "No ID Source" });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Source must have an id");
    });

    it("should return 404 when updating a non-existent source", async () => {
      const res = await request(testApp)
        .put("/sources/non-existent")
        .send({ name: "Updated Source" });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Source not found");
    });

    it("should return 404 when deleting a non-existent source", async () => {
      const res = await request(testApp).delete("/sources/non-existent");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Source not found");
    });
  });

  describe("File Operations", () => {
    it("should load sources from existing file", async () => {
      const initialSources = [{ id: "test1", name: "Test 1" }];
      writeFileSync(TEST_SOURCES_FILE, JSON.stringify(initialSources));

      // Reset to load from file
      await (sourcesRouter as any).reset();

      const res = await request(testApp).get("/sources");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(initialSources);
    });

    it("should save sources to file after modifications", async () => {
      const newSource = { id: "test2", name: "Test 2" };
      await request(testApp).post("/sources").send(newSource);

      // Wait a bit for the file to be written
      await new Promise((resolve) => setTimeout(resolve, 100));

      const fileContent = JSON.parse(
        existsSync(TEST_SOURCES_FILE)
          ? readFileSync(TEST_SOURCES_FILE, "utf-8")
          : "[]"
      );
      expect(fileContent).toContainEqual(newSource);
    });

    it("should handle malformed sources file", async () => {
      writeFileSync(TEST_SOURCES_FILE, "invalid json");

      // Reset to trigger file load
      await (sourcesRouter as any).reset();

      const res = await request(testApp).get("/sources");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should handle file write errors gracefully", async () => {
      // Make the file read-only
      writeFileSync(TEST_SOURCES_FILE, "[]", { mode: 0o444 });

      const newSource = { id: "test3", name: "Test 3" };
      const res = await request(testApp).post("/sources").send(newSource);

      expect(res.status).toBe(201);
      expect(res.body.source).toEqual(newSource);
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple sources with proper ordering", async () => {
      const sources = [
        { id: "1", name: "First" },
        { id: "2", name: "Second" },
        { id: "3", name: "Third" },
      ];

      for (const source of sources) {
        await request(testApp).post("/sources").send(source);
      }

      const res = await request(testApp).get("/sources");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body).toEqual(sources);
    });

    it("should preserve other fields when updating", async () => {
      const original = { id: "test4", name: "Test 4", extra: "data" };
      await request(testApp).post("/sources").send(original);

      const update = { name: "Updated Test 4" };
      const res = await request(testApp).put("/sources/test4").send(update);

      expect(res.status).toBe(200);
      expect(res.body.source.extra).toBe("data");
      expect(res.body.source.name).toBe("Updated Test 4");
    });
  });
});
