// pm2 실행 설정. 서버에서 `pm2 start ecosystem.config.js`로 띄운다.
// 지금까지 pm2 CLI 인자로만 존재해서 서버가 날아가면 복원 근거가 없었다.
export default {
  apps: [
    {
      name: "ai-outing-agent",
      script: "node_modules/.bin/next",
      args: "start -H 127.0.0.1 -p 4000",
      cwd: "/home2/wa26bteam02/motion_nadeulplan",
      env: { NODE_ENV: "production" },
      // 정상 상태가 RSS 350MB(heap 127MB)라 400M로 잡으면 재시작 루프가 돈다.
      max_memory_restart: "600M",
    },
  ],
};
