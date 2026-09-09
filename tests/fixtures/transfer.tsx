// Manual browser integration fixture: Vite development only, fixed local chain.
// Never bundled into the wallet's production entry, never uses mainnet funds.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SendDialog } from "../../src/components/SendDialog";
import { MAINNET, createChainClient } from "../../src/lib/chain";
import { generateMnemonic, deriveAccount } from "../../src/crypto";
import {
  account,
  signCall,
} from "../../vendor/quantus-wasm/browser/quantus_wasm.js";
import { initializeWasm, bytesToHex, hexToBytes } from "../../src/crypto/core";
import {
  createSession,
  emptyVault,
  encryptVault,
  type Pending,
  type Wallet,
} from "../../src/lib/vault";
import "../../src/style.css";
if (!import.meta.env.DEV)
  throw new Error("Development fixture is unavailable in production");
const client = createChainClient({
  ...MAINNET,
  rpcUrl: "http://127.0.0.1:9945",
  genesisHash:
    "0x87d495dc86f8a28cdd83e4836750940a0a02b22b9b33b42e34fb00868649b28b",
});
const mnemonic = await generateMnemonic();
const sender = await deriveAccount(mnemonic, 0),
  recipient = await deriveAccount(mnemonic, 1);
await initializeWasm();
const alice = account(new Uint8Array(32));
try {
  const prepared = await client.prepareTransfer(
    alice.address,
    sender.address,
    "10000000000000",
  );
  const hex = bytesToHex(
    signCall(new Uint8Array(32), hexToBytes(prepared.callHex), prepared.ctx),
  );
  await client.submitTransfer(hex);
} finally {
  alice.free();
}
for (let i = 0; i < 25; i++) {
  if (BigInt((await client.readBalance(sender.address)).free) > 0n) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const wallet: Wallet = {
  id: "dev-qa",
  name: "隔离开发链 UI 测试",
  kind: "mldsa87",
  address: sender.address,
  index: 0,
  mnemonic,
  createdAt: Date.now(),
};
const vault = await createSession("Disposable-Local-Dev-Fixture");
let entries: Pending[] = [];
const record = async (tx: Pending) => {
  entries = [tx, ...entries.filter((p) => p.hash !== tx.hash)];
  sessionStorage.setItem(
    "quantus-dev-fixture",
    await encryptVault(vault, {
      ...emptyVault(),
      wallets: [wallet],
      pending: entries,
    }),
  );
};
function Fixture() {
  const [shown, setShown] = useState(true),
    [state, setState] = useState("等待浏览器操作"),
    [receipt, setReceipt] = useState("");
  return (
    <main style={{ maxWidth: 800 }}>
      <h1>隔离开发链 · UI 转账验证</h1>
      <p>仅在本机开发链使用新建的一次性测试账户。</p>
      <p id="recipient">{recipient.address}</p>
      <p id="status">{state}</p>
      <pre id="result">{receipt}</pre>
      {shown && (
        <SendDialog
          wallet={wallet}
          wallets={[]}
          services={{
            ...client,
            networkName: "Isolated DEV (127.0.0.1)",
            symbol: "DEV",
            submitTransfer: async (hex) => {
              const hash = await client.submitTransfer(hex);
              const tx = entries.find((p) => p.hash === hash);
              if (!tx)
                throw new Error("Hash was not journaled before submission");
              void client.trackTransfer(
                hash,
                tx.startBlock,
                (s) => {
                  setState(s.status);
                  if (s.status === "finalized")
                    void client
                      .readBalance(recipient.address)
                      .then((b) =>
                        setReceipt(
                          JSON.stringify({
                            hash,
                            recipient: recipient.address,
                            received: b.free,
                            journalBeforeBroadcast: true,
                          }),
                        ),
                      );
                },
                { pollIntervalMs: 1000 },
              );
              return hash;
            },
          }}
          onClose={() => setShown(false)}
          onSubmitted={record}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
