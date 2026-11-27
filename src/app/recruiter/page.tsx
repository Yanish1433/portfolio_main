import { RobotChatClient } from "@/components/recruiter/RobotChatClient";
import { PagodaHero } from "@/components/recruiter/PagodaHero";
import { RecruiterBook } from "@/components/recruiter/book/RecruiterBook";
import { buildPages } from "@/components/recruiter/book/chapters";
import styles from "@/components/recruiter/recruiter.module.css";
import { aboutPhoto } from "@/content/aboutPhoto";
import { profile } from "@/content/profile";
import TimePill from "@/lib/time/TimePill";

export default function RecruiterPage() {
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
