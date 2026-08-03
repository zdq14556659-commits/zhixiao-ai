const assert = require("assert");
const { createMysqlStore } = require("./storage/mysql-store");

const events = [];
let connectionNumber = 0;

const mysqlClient = {
  createPool() {
    return {
      async getConnection() {
        const current = ++connectionNumber;
        return {
          async beginTransaction() {
            events.push(`begin:${current}`);
            if (current === 1) await new Promise((resolve) => setTimeout(resolve, 25));
          },
          async execute(sql, params) {
            if (sql.includes("INSERT INTO customers")) {
              events.push(`customer:${current}:${JSON.parse(params[17]).name}`);
            }
          },
          async commit() {
            events.push(`commit:${current}`);
          },
          async rollback() {},
          release() {}
        };
      },
      async end() {}
    };
  }
};

async function run() {
  const store = createMysqlStore({
    url: "mysql://test:test@127.0.0.1:3306/zhixiao_ai",
    mysqlClient
  });
  const firstCustomer = { id: 1, name: "first" };
  const firstWrite = store.persistChanges({ customers: [firstCustomer] });
  firstCustomer.name = "mutated-after-queue";
  const secondWrite = store.persistChanges({ customers: [{ id: 1, name: "second" }] });

  assert.equal(store.status().pendingWrites, 2);
  await Promise.all([firstWrite, secondWrite]);
  assert.deepEqual(events, [
    "begin:1",
    "customer:1:first",
    "commit:1",
    "begin:2",
    "customer:2:second",
    "commit:2"
  ]);
  assert.equal(store.status().pendingWrites, 0);
  await store.close();
}

run()
  .then(() => console.log("mysql store queue tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
