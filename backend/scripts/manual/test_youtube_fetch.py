from app.services.youtube_service import search_youtube_content

results = search_youtube_content("python beginner", max_results_per_type=5)

print("Total results:", len(results))

for item in results:
    print(
        item["content_type"],
        "|",
        item["external_id"],
        "|",
        item["normalized_title"],
    )
    