from app.db.session import SessionLocal
from app.models.raw_course import RawCourse
from app.services.course_filtering_service import process_raw_courses
from app.services.course_ingestion_service import create_ingestion, save_raw_courses
from app.services.youtube_service import search_youtube_content

db = SessionLocal()

try:
    query = "python beginner"

    ingestion = create_ingestion(
        db=db,
        source="youtube",
        query=query,
        status="success",
    )

    results = search_youtube_content(query=query, max_results_per_type=5)

    save_raw_courses(
        db=db,
        ingestion_id=ingestion.id,
        raw_items=results,
    )

    promoted_courses = process_raw_courses(
        db=db,
        ingestion_id=ingestion.id,
    )

    print("Ingestion ID:", ingestion.id)
    print("Promoted courses:", len(promoted_courses))

    for course in promoted_courses:
        print(
            course.id,
            "|",
            course.content_type,
            "|",
            course.title,
            "|",
            course.language,
        )

    print("\nRejected / processed raw items:")
    raw_items = (
        db.query(RawCourse)
        .filter(RawCourse.ingestion_id == ingestion.id)
        .all()
    )

    for item in raw_items:
        print(
            item.external_id,
            "|",
            item.content_type,
            "|",
            item.normalized_title,
            "| accepted =", item.is_accepted,
            "| language =", item.language,
            "| reason =", item.rejection_reason,
        )

finally:
    db.close()