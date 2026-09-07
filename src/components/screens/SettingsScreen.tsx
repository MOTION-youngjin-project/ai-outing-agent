"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { ScreenHeader } from "@/components/ScreenHeader";

const inputClass =
  "rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60";

export function SettingsScreen() {
  const { setView } = useAppStore();
  const { data: session, update } = useSession();

  const [name, setName] = useState(session?.user?.name ?? "");
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [namePending, setNamePending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);

  async function saveName() {
    setNameError("");
    setNameSaved(false);
    setNamePending(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNameError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      const data = await res.json();
      await update({ name: data.name ?? null });
      setNameSaved(true);
    } finally {
      setNamePending(false);
    }
  }

  async function savePassword() {
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setPasswordPending(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error ?? "변경에 실패했습니다.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="앱 설정" onBack={() => setView("mypage")} />
      <div className="flex flex-col gap-6 px-5">
        <div className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[13px] font-semibold text-muted">이름</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
            className="flex gap-2"
          >
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameSaved(false);
              }}
              placeholder="이름"
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="submit"
              disabled={namePending}
              className="rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-white disabled:bg-slate-200"
            >
              저장
            </button>
          </form>
          {nameError && <p className="px-1 text-[13px] text-rose-500">{nameError}</p>}
          {nameSaved && <p className="px-1 text-[13px] text-accent">저장했습니다.</p>}
        </div>

        <div className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[13px] font-semibold text-muted">비밀번호 변경</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePassword();
            }}
            className="flex flex-col gap-2.5"
          >
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setPasswordSaved(false);
              }}
              placeholder="현재 비밀번호"
              className={inputClass}
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordSaved(false);
              }}
              placeholder="새 비밀번호 (8자 이상)"
              className={inputClass}
            />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordSaved(false);
              }}
              placeholder="새 비밀번호 확인"
              className={inputClass}
            />
            {passwordError && <p className="px-1 text-[13px] text-rose-500">{passwordError}</p>}
            {passwordSaved && <p className="px-1 text-[13px] text-accent">비밀번호를 변경했습니다.</p>}
            <button
              type="submit"
              disabled={passwordPending}
              className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[15px] font-semibold text-white disabled:bg-slate-200"
            >
              비밀번호 변경
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
