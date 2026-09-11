// Next는 .env.local을 읽지만 prisma CLI와 tsx 스크립트는 .env만 읽는다 — 같은 값을 두 파일에
// 중복해서 적어두지 않도록, 스크립트 진입점은 "dotenv/config" 대신 이 파일을 import한다.
import { config } from "dotenv";

config({ path: ".env.local" });
config();
