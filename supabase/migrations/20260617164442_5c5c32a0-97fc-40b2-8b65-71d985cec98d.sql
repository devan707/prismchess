UPDATE public.forum_topics
SET title = '🔺 Welcome to Prism Chess',
    body  = E'Welcome, challenger.\n\nThis is the community hub for Prism Chess. Use it to share variant designs, swap strategy, and report bugs.\n\nA few starter threads:\n• Featured Game — spotlighted variants chosen by the admins.\n• Share Your Custom Games — post your sandbox creations and let others play them.\n\nHave fun, and may your light split many ways.'
WHERE title = '👑 Welcome to Kingdom Chess';

UPDATE public.forum_topics
SET body = REPLACE(body, 'Kingdom Chess', 'Prism Chess')
WHERE body LIKE '%Kingdom Chess%';