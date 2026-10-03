import { useEffect, useState } from "react";

const KEY = "proc:getting-started:v1";
export const gettingStartedSteps = ["controls", "first-purchase", "finance"] as const;
export type GettingStartedStep = (typeof gettingStartedSteps)[number];

type Progress = Record<GettingStartedStep, boolean>;
const emptyProgress = (): Progress => ({ controls: false, "first-purchase": false, finance: false });

/** Review acknowledgements only. They do not activate a policy or integration. */
export function useGettingStarted(entityId: string) {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    try {
      const saved = localStorage.getItem(`${KEY}:${entityId}`);
      setProgress(saved ? { ...emptyProgress(), ...JSON.parse(saved) } : emptyProgress());
    } catch {
      setProgress(emptyProgress());
    }
    setLoaded(true);
  }, [entityId]);

  const setReviewed = (step: GettingStartedStep, reviewed: boolean) => {
    setProgress((current) => {
      const next = { ...current, [step]: reviewed };
      localStorage.setItem(`${KEY}:${entityId}`, JSON.stringify(next));
      return next;
    });
  };

  return { progress, loaded, reviewedCount: gettingStartedSteps.filter((step) => progress[step]).length, setReviewed };
}
