"use strict";

jest.mock("../../../config/pool");

const pool = require("../../../config/pool");
const { withTransaction } = require("../../../lib/withTransaction");

describe("withTransaction", () => {
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(conn);
  });

  test("sucesso: begin → fn → commit → release, retorna resultado", async () => {
    const result = await withTransaction(async (c) => {
      expect(c).toBe(conn);
      return { id: 42 };
    });

    expect(result).toEqual({ id: 42 });
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  test("erro: begin → fn throws → rollback → release → re-throw", async () => {
    await expect(
      withTransaction(async () => { throw new Error("fail"); })
    ).rejects.toThrow("fail");

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  test("rollback falho não esconde erro original", async () => {
    conn.rollback.mockRejectedValue(new Error("rollback fail"));

    await expect(
      withTransaction(async () => { throw new Error("original"); })
    ).rejects.toThrow("original");

    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  test("release é chamado mesmo se commit falha", async () => {
    conn.commit.mockRejectedValue(new Error("commit fail"));

    await expect(
      withTransaction(async () => "ok")
    ).rejects.toThrow("commit fail");

    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
