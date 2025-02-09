import request from "supertest";
import type { Application } from "express";
import app from "../src/app";

// Cast the imported app to an Express instance
const testApp = app as Application;

describe("Sources API", () => {
  const sourceId = "test-source";

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
    const updatedSource = { name: "Updated Test Source" };
    const res = await request(testApp)
      .put(`/sources/${sourceId}`)
      .send(updatedSource);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Source updated");
    expect(res.body.source.name).toBe("Updated Test Source");
  });

  it("should delete the source via DELETE", async () => {
    const res = await request(testApp).delete(`/sources/${sourceId}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Source removed");
  });

  // Error case: POST without an id should return 400
  it("should return 400 when trying to add a source without an id", async () => {
    const res = await request(testApp)
      .post("/sources")
      .send({ name: "No ID Source" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Source must have an id");
  });

  // Error case: PUT for a non-existent source should return 404
  it("should return 404 when updating a non-existent source", async () => {
    const res = await request(testApp)
      .put("/sources/non-existent")
      .send({ name: "Updated Source" });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Source not found");
  });

  // Error case: DELETE for a non-existent source should return 404
  it("should return 404 when deleting a non-existent source", async () => {
    const res = await request(testApp).delete("/sources/non-existent");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Source not found");
  });
});
