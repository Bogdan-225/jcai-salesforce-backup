// 05:00 in the scheduling user's time zone (Bogdan = Asia/Tokyo) = 20:00 UTC, same slot as Opportunity_Scheduled_RecomputeStalled
System.schedule('SellSideConflict Daily', '0 0 5 * * ?', new SellSideConflictScheduler());
