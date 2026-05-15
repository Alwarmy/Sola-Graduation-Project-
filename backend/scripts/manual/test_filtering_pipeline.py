from app.db.session import SessionLocal
from app.services.course_filtering_service import process_raw_courses

db = SessionLocal()

try:
    promoted_courses = process_raw_courses(db=db, ingestion_id=1)

    print("Promoted courses:", len(promoted_courses))

    for course in promoted_courses:
        print(course.id, "|", course.content_type, "|", course.title, "|", course.language)

finally:
    db.close()