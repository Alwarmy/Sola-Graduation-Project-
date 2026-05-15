from app.db.session import SessionLocal
from app.services.youtube_service import search_youtube_content
from app.services.course_ingestion_service import create_ingestion, save_raw_courses

db = SessionLocal()

try:
    query = "python beginner"

    ingestion = create_ingestion(
        db=db,
        source="youtube",
        query=query,
        status="success",
    )

    results = search_youtube_content(query=query, max_results_per_type=3)

    saved_raw_courses = save_raw_courses(
        db=db,
        ingestion_id=ingestion.id,
        raw_items=results,
    )

    print("Ingestion ID:", ingestion.id)
    print("Saved raw courses:", len(saved_raw_courses))

    for item in saved_raw_courses:
        print(item.id, "|", item.content_type, "|", item.normalized_title)

finally:
    db.close()