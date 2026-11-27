import { preload } from "react-dom";
import { RobotChatClient } from "@/components/recruiter/RobotChatClient";
import { PagodaHero } from "@/components/recruiter/PagodaHero";
import { RecruiterBook } from "@/components/recruiter/book/RecruiterBook";
import { buildPages } from "@/components/recruiter/book/chapters";
import styles from "@/components/recruiter/recruiter.module.css";
import { aboutPhoto } from "@/content/aboutPhoto";
import { profile } from "@/content/profile";
import TimePill from "@/lib/time/TimePill";

export default function RecruiterPage() {
  // The cover is the first thing painted: fetch its leather early.
  preload("/book/leather.webp", { as: "image" });
  return (
    <>
      <PagodaHero />
      <main>
        <RecruiterBook pages={buildPages(aboutPhoto())} name={profile.name} title={profile.title} />
      </main>
      <TimePill className={styles.timeCorner} />
      <RobotChatClient />
    </>
  );
}
