import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BinarySerde } from "../serializer/binary.js";
import type { Schema } from "../serializer/types.js";

describe("BinarySerde", () => {
  describe("serialize", () => {
    it("serializes a single int8 field", () => {
      const schema: Schema = { fields: [{ name: "age", type: "int8" }] };
      const serde = new BinarySerde<{ age: number }>(schema);
      const buf = serde.serialize({ age: 42 });
      assert.equal(buf.length, 1);
      assert.equal(buf[0], 42);
    });

    it("serializes a single uint32 field little-endian", () => {
      const schema: Schema = { fields: [{ name: "count", type: "uint32" }] };
      const serde = new BinarySerde<{ count: number }>(schema);
      const buf = serde.serialize({ count: 0xDEADBEEF });
      assert.equal(buf.length, 4);
      const view = new DataView(buf.buffer);
      assert.equal(view.getUint32(0, true), 0xDEADBEEF);
    });

    it("serializes a boolean field as 1 byte", () => {
      const schema: Schema = { fields: [{ name: "active", type: "bool" }] };
      const serde = new BinarySerde<{ active: boolean }>(schema);
      assert.equal(serde.serialize({ active: true })[0], 1);
      assert.equal(serde.serialize({ active: false })[0], 0);
    });

    it("serializes a float64 field", () => {
      const schema: Schema = { fields: [{ name: "pi", type: "float64" }] };
      const serde = new BinarySerde<{ pi: number }>(schema);
      const buf = serde.serialize({ pi: Math.PI });
      assert.equal(buf.length, 8);
      const view = new DataView(buf.buffer);
      assert.ok(Math.abs(view.getFloat64(0, true) - Math.PI) < 1e-15);
    });

    it("serializes a string with uint16 length prefix", () => {
      const schema: Schema = { fields: [{ name: "name", type: "string" }] };
      const serde = new BinarySerde<{ name: string }>(schema);
      const buf = serde.serialize({ name: "Hello" });
      const view = new DataView(buf.buffer);
      assert.equal(view.getUint16(0, true), 5);
      assert.equal(buf.length, 7);
    });

    it("serializes multiple fields in schema order", () => {
      const schema: Schema = {
        fields: [
          { name: "id", type: "uint32" },
          { name: "name", type: "string" },
          { name: "score", type: "float32" },
        ],
      };
      const serde = new BinarySerde<{ id: number; name: string; score: number }>(schema);
      const buf = serde.serialize({ id: 1, name: "ABC", score: 9.5 });
      const view = new DataView(buf.buffer);
      assert.equal(view.getUint32(0, true), 1);
      assert.equal(view.getUint16(4, true), 3);
    });
  });

  describe("deserialize", () => {
    it("deserializes int8", () => {
      const schema: Schema = { fields: [{ name: "val", type: "int8" }] };
      const serde = new BinarySerde<{ val: number }>(schema);
      assert.equal(serde.deserialize(new Uint8Array([42])).val, 42);
    });

    it("deserializes negative int32", () => {
      const schema: Schema = { fields: [{ name: "delta", type: "int32" }] };
      const serde = new BinarySerde<{ delta: number }>(schema);
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setInt32(0, -100, true);
      assert.equal(serde.deserialize(buf).delta, -100);
    });
  });

  describe("round-trip", () => {
    it("preserves complex object through serialize-deserialize", () => {
      const schema: Schema = {
        fields: [
          { name: "id", type: "uint32" },
          { name: "title", type: "string" },
          { name: "price", type: "float64" },
          { name: "inStock", type: "bool" },
        ],
      };
      const serde = new BinarySerde<{ id: number; title: string; price: number; inStock: boolean }>(schema);
      const original = { id: 42, title: "Widget", price: 19.99, inStock: true };
      assert.deepStrictEqual(serde.deserialize(serde.serialize(original)), original);
    });

    it("handles uint16 array round-trip", () => {
      const schema: Schema = { fields: [{ name: "tags", type: "uint16", array: true }] };
      const serde = new BinarySerde<{ tags: number[] }>(schema);
      const original = { tags: [10, 20, 30] };
      assert.deepStrictEqual(serde.deserialize(serde.serialize(original)), original);
    });

    it("handles empty string round-trip", () => {
      const schema: Schema = { fields: [{ name: "text", type: "string" }] };
      const serde = new BinarySerde<{ text: string }>(schema);
      assert.equal(serde.serialize({ text: "" }).length, 2);
      assert.equal(serde.deserialize(serde.serialize({ text: "" })).text, "");
    });

    it("handles zero values correctly", () => {
      const schema: Schema = {
        fields: [
          { name: "a", type: "int8" },
          { name: "b", type: "uint32" },
          { name: "c", type: "float64" },
        ],
      };
      const serde = new BinarySerde<{ a: number; b: number; c: number }>(schema);
      const original = { a: 0, b: 0, c: 0 };
      assert.deepStrictEqual(serde.deserialize(serde.serialize(original)), original);
    });
  });

  describe("getSchema", () => {
    it("returns the constructor schema", () => {
      const schema: Schema = { fields: [{ name: "x", type: "int32" }] };
      assert.deepStrictEqual(new BinarySerde(schema).getSchema(), schema);
    });
  });
});
