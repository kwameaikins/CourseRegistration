<?php
/**
 * Plugin Name: Knowsia Live Programmes
 * Description: Renders the live programme catalogue from reg.knowsia.com (seats, pricing, dates) on knowsia.com. Read-only; registration still happens on the portal.
 * Version:     1.0.0
 * Author:      Knowsia
 *
 * WHY A PLUGIN AND NOT A THEME TEMPLATE
 * Theme edits are lost on theme update and are awkward to version. A small
 * plugin keeps this integration self-contained and removable.
 *
 * WHY SHORTCODE + REWRITE AND NOT A CUSTOM POST TYPE
 * There is no content to store here. The programmes live in the portal's
 * database and must stay live; copying them into WordPress posts would
 * reintroduce exactly the stale-data problem this project exists to remove.
 *
 * IMPORTANT — this site already runs LearnPress at /courses/ for self-paced
 * courses. This plugin deliberately uses /programmes/ and must never be
 * pointed at /courses/, or it will collide with LearnPress's post type.
 *
 * SETUP (everything is configurable from wp-admin; no file editing required)
 *   1. Activate the plugin.
 *   2. Settings > Knowsia Programmes: paste the API key, and set the page slug
 *      to match the page you will create. Click "Test connection" — it reports
 *      exactly what went wrong if anything did.
 *   3. Create a Page with that slug, containing: [knowsia_programmes]
 *      Title it "Live Programmes"; the title and the slug need not match.
 *   4. Visit Settings > Permalinks once to flush rewrite rules.
 *
 * Optionally, to keep the key out of the database, define these in
 * wp-config.php instead — both take precedence over the settings fields:
 *     define( 'KNOWSIA_CATALOG_API_KEY', '...' );
 *     define( 'KNOWSIA_PROGRAMMES_SLUG', 'live-programmes' );
 *
 * @package Knowsia
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'KNOWSIA_CACHE_KEY', 'knowsia_catalog_v1' );
define( 'KNOWSIA_FALLBACK_KEY', 'knowsia_catalog_fallback_v1' );
define( 'KNOWSIA_CACHE_TTL', 60 );          // Seconds. Freshness vs. load.
define( 'KNOWSIA_FALLBACK_TTL', WEEK_IN_SECONDS );

// The page slug this plugin renders on, and the first segment of every
// detail URL (/programmes/AI02). Override in wp-config.php BEFORE the page
// is published and indexed:
//
//     define( 'KNOWSIA_PROGRAMMES_SLUG', 'live-programmes' );
//
// Two things must move together if you change it: the WordPress page's own
// slug, and RETIRE_PROGRAMMES_REDIRECT's destination on reg.knowsia.com
// (MARKETING_PROGRAMMES_PATH in next.config.ts). A mismatch sends every
// redirected visitor to a 404.
//
// The DISPLAY label is separate and lives in the page title and menu item —
// "Live Programmes" is the recommended wording, to distinguish these
// cohort-based trainings from the self-paced LearnPress courses at /courses/.
// The label can say "Live Programmes" while the slug stays /programmes.
function knowsia_page_slug() {
	if ( defined( 'KNOWSIA_PROGRAMMES_SLUG' ) && KNOWSIA_PROGRAMMES_SLUG ) {
		return trim( KNOWSIA_PROGRAMMES_SLUG, '/' );
	}
	$stored = get_option( 'knowsia_page_slug' );
	return $stored ? trim( $stored, '/' ) : 'programmes';
}

/* -------------------------------------------------------------------------
 * API CLIENT
 * ---------------------------------------------------------------------- */

function knowsia_api_base() {
	if ( defined( 'KNOWSIA_CATALOG_API_BASE' ) && KNOWSIA_CATALOG_API_BASE ) {
		return rtrim( KNOWSIA_CATALOG_API_BASE, '/' );
	}
	$stored = get_option( 'knowsia_api_base' );
	return $stored ? rtrim( $stored, '/' ) : 'https://reg.knowsia.com';
}

/**
 * The API key, from wp-config.php if defined, otherwise from Settings.
 *
 * The constant is preferred: it keeps the secret out of the database, and so
 * out of database dumps and backups. The settings-page fallback exists
 * because plenty of managed hosts make editing wp-config.php awkward, and a
 * blocked setup is worse than a secret in wp_options — especially here, where
 * the key guards data that is already public and exists mainly to stop the
 * endpoint being scraped.
 */
function knowsia_api_key() {
	// Trimmed: pasting a secret very easily carries a trailing newline or
	// space, and the resulting 401 looks identical to a wrong key in both the
	// WordPress field and the Vercel dashboard. The API trims its side too.
	if ( defined( 'KNOWSIA_CATALOG_API_KEY' ) && KNOWSIA_CATALOG_API_KEY ) {
		return trim( KNOWSIA_CATALOG_API_KEY );
	}
	return trim( (string) get_option( 'knowsia_api_key', '' ) );
}

/**
 * Fetch from the catalog API with a two-tier cache.
 *
 * Tier 1 is a short TTL cache for normal operation. Tier 2 is a long-lived
 * copy of the last response that ever succeeded, used ONLY when the API is
 * unreachable. A marketing page showing slightly stale seat counts is far
 * better than one showing nothing, and the portal re-validates availability
 * at registration time anyway.
 *
 * @param string $path  API path, e.g. '/api/public/catalog'.
 * @param string $slot  Cache slot suffix, so list and detail do not overwrite each other.
 * @return array|WP_Error Decoded response body, or WP_Error when there is nothing to show.
 */
function knowsia_fetch( $path, $slot = 'list' ) {
	$cache_key    = KNOWSIA_CACHE_KEY . '_' . $slot;
	$fallback_key = KNOWSIA_FALLBACK_KEY . '_' . $slot;

	$cached = get_transient( $cache_key );
	if ( false !== $cached ) {
		return $cached;
	}

	$api_key = knowsia_api_key();
	if ( ! $api_key ) {
		knowsia_log( 'No API key set — add it under Settings > Knowsia Programmes, or define KNOWSIA_CATALOG_API_KEY in wp-config.php' );
		return knowsia_fallback_or_error(
			$fallback_key,
			'No API key is saved. Add it under Settings > Knowsia Programmes.'
		);
	}

	$response = wp_remote_get(
		knowsia_api_base() . $path,
		array(
			'timeout' => 8,
			'headers' => array(
				'Authorization' => 'Bearer ' . $api_key,
				'Accept'        => 'application/json',
			),
		)
	);

	if ( is_wp_error( $response ) ) {
		knowsia_log( 'Request failed for ' . $path . ': ' . $response->get_error_message() );
		// Almost always the host blocking outbound HTTP, or DNS. Say so —
		// this is the single most common install failure and the previous
		// wording ("Could not reach the catalogue") sent people looking at
		// the wrong thing.
		return knowsia_fallback_or_error(
			$fallback_key,
			'Could not reach ' . knowsia_api_base() . ' — the host may be blocking outbound HTTP requests. '
			. 'Details: ' . $response->get_error_message()
		);
	}

	$code = wp_remote_retrieve_response_code( $response );

	// A 401 means we reached the API fine and it rejected the key. That is a
	// completely different fix from an outage, so it gets its own message
	// rather than hiding inside "temporarily unavailable".
	if ( 401 === $code ) {
		knowsia_log( 'API rejected the key for ' . $path );
		return knowsia_fallback_or_error(
			$fallback_key,
			'The API key was rejected (HTTP 401). The key saved here must match CATALOG_API_KEY '
			. 'in the Vercel project for ' . knowsia_api_base() . ' exactly.'
		);
	}

	// A 404 is a legitimate answer ("no such programme"), not an outage — do
	// not serve stale fallback data over it, or a retired programme would
	// linger on the site indefinitely.
	if ( 404 === $code ) {
		return new WP_Error( 'knowsia_not_found', 'Programme not found.' );
	}

	if ( 200 !== $code ) {
		knowsia_log( 'Unexpected HTTP ' . $code . ' for ' . $path );
		return knowsia_fallback_or_error(
			$fallback_key,
			'Catalogue is temporarily unavailable (HTTP ' . $code . ').'
		);
	}

	$body = json_decode( wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $body ) || ! isset( $body['data'] ) ) {
		knowsia_log( 'Malformed JSON for ' . $path );
		return knowsia_fallback_or_error( $fallback_key, 'Catalogue returned unexpected data.' );
	}

	set_transient( $cache_key, $body['data'], KNOWSIA_CACHE_TTL );
	set_transient( $fallback_key, $body['data'], KNOWSIA_FALLBACK_TTL );

	return $body['data'];
}

function knowsia_fallback_or_error( $fallback_key, $message ) {
	$fallback = get_transient( $fallback_key );
	if ( false !== $fallback ) {
		return $fallback;
	}
	return new WP_Error( 'knowsia_unavailable', $message );
}

function knowsia_log( $message ) {
	if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
		error_log( '[knowsia-programmes] ' . $message ); // phpcs:ignore
	}
}

/* -------------------------------------------------------------------------
 * FORMATTING HELPERS
 * ---------------------------------------------------------------------- */

function knowsia_money( $amount, $currency = 'GHS' ) {
	return esc_html( $currency . ' ' . number_format( (float) $amount, 0 ) );
}

function knowsia_date_range( $start, $end ) {
	$start_ts = strtotime( $start );
	$end_ts   = strtotime( $end );
	if ( ! $start_ts ) {
		return '';
	}
	if ( $end_ts && gmdate( 'Y-m', $start_ts ) === gmdate( 'Y-m', $end_ts ) ) {
		// Same month: "2–6 March 2026".
		return gmdate( 'j', $start_ts ) . '–' . gmdate( 'j F Y', $end_ts );
	}
	return $end_ts
		? gmdate( 'j M Y', $start_ts ) . ' – ' . gmdate( 'j M Y', $end_ts )
		: gmdate( 'j M Y', $start_ts );
}

/**
 * Seat availability copy.
 *
 * `seatsRemaining: null` means the cohort is UNCAPPED — it must not render as
 * "0 seats left". This is the single easiest field to get wrong.
 */
function knowsia_seats_label( $session ) {
	if ( ! empty( $session['isFull'] ) ) {
		return 'Fully booked — join the waitlist';
	}
	if ( ! array_key_exists( 'seatsRemaining', $session ) || null === $session['seatsRemaining'] ) {
		return ''; // Uncapped: say nothing rather than invent a number.
	}
	$seats = (int) $session['seatsRemaining'];
	if ( $seats <= 5 ) {
		return sprintf( 'Only %d seat%s left', $seats, 1 === $seats ? '' : 's' );
	}
	return sprintf( '%d seats available', $seats );
}

/** Price block: free, early-bird (with its real deadline), or list price. */
function knowsia_price_html( $session, $currency ) {
	if ( ! empty( $session['isFree'] ) ) {
		return '<span class="kn-price kn-price--free">Free</span>';
	}

	$list      = isset( $session['listFee'] ) ? (float) $session['listFee'] : 0;
	$effective = isset( $session['effectiveFee'] ) ? (float) $session['effectiveFee'] : $list;

	// Only ever show a discount alongside the date it expires — a permanent
	// "was/now" is manufactured urgency, and the API guarantees the deadline
	// is present whenever the effective fee is genuinely lower.
	if ( $effective < $list && ! empty( $session['earlyBirdEndsOn'] ) ) {
		return sprintf(
			'<span class="kn-price"><s class="kn-price__was">%s</s> <strong>%s</strong></span>'
			. '<span class="kn-price__note">Early rate until %s</span>',
			knowsia_money( $list, $currency ),
			knowsia_money( $effective, $currency ),
			esc_html( gmdate( 'j M Y', strtotime( $session['earlyBirdEndsOn'] ) ) )
		);
	}

	return '<span class="kn-price"><strong>' . knowsia_money( $effective, $currency ) . '</strong></span>';
}

/* -------------------------------------------------------------------------
 * ROUTING  (/programmes and /programmes/{courseCode})
 * ---------------------------------------------------------------------- */

add_action(
	'init',
	function () {
		add_rewrite_rule(
			'^' . knowsia_page_slug() . '/([A-Za-z0-9_-]+)/?$',
			'index.php?pagename=' . knowsia_page_slug() . '&knowsia_code=$matches[1]',
			'top'
		);
	}
);

add_filter(
	'query_vars',
	function ( $vars ) {
		$vars[] = 'knowsia_code';
		return $vars;
	}
);

// Rewrite rules are stored in the database, so they must be flushed once on
// activation or /programmes/AI05 will 404 until someone saves permalinks.
register_activation_hook(
	__FILE__,
	function () {
		add_rewrite_rule(
			'^' . knowsia_page_slug() . '/([A-Za-z0-9_-]+)/?$',
			'index.php?pagename=' . knowsia_page_slug() . '&knowsia_code=$matches[1]',
			'top'
		);
		flush_rewrite_rules();
	}
);
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );

// Changing the slug changes the rewrite rule, and rewrite rules live in the
// database — so without this, saving a new slug appears to work but every
// detail URL 404s until someone manually re-saves permalinks. Flushing on
// change removes that trap entirely.
add_action(
	'update_option_knowsia_page_slug',
	function () {
		add_rewrite_rule(
			'^' . knowsia_page_slug() . '/([A-Za-z0-9_-]+)/?$',
			'index.php?pagename=' . knowsia_page_slug() . '&knowsia_code=$matches[1]',
			'top'
		);
		flush_rewrite_rules();
	}
);

/* -------------------------------------------------------------------------
 * SHORTCODE
 * ---------------------------------------------------------------------- */

add_shortcode(
	'knowsia_programmes',
	function () {
		$code = get_query_var( 'knowsia_code' );

		ob_start();
		if ( $code ) {
			knowsia_render_detail( sanitize_text_field( $code ) );
		} else {
			knowsia_render_catalog();
		}
		return ob_get_clean();
	}
);

function knowsia_render_unavailable( $message ) {
	printf(
		'<div class="kn-empty"><p>%s</p><p><a href="%s">Contact us</a> and we will help you register.</p></div>',
		esc_html( $message ),
		esc_url( home_url( '/contact' ) )
	);
}

function knowsia_render_catalog() {
	$data = knowsia_fetch( '/api/public/catalog', 'list' );

	if ( is_wp_error( $data ) ) {
		knowsia_render_unavailable( 'Programme information is temporarily unavailable — please check back shortly.' );
		return;
	}

	$courses = isset( $data['courses'] ) && is_array( $data['courses'] ) ? $data['courses'] : array();

	if ( empty( $courses ) ) {
		knowsia_render_unavailable( 'No programmes are open for registration right now.' );
		return;
	}

	echo '<div class="kn-grid">';
	foreach ( $courses as $course ) {
		knowsia_render_card( $course );
	}
	echo '</div>';
}

function knowsia_render_card( $course ) {
	$currency = isset( $course['currency'] ) ? $course['currency'] : 'GHS';
	$sessions = isset( $course['sessions'] ) && is_array( $course['sessions'] ) ? $course['sessions'] : array();

	// The card shows the next actionable cohort; the detail page lists them
	// all. Prefer one with seats so the card's CTA is usually a real one.
	$next = null;
	foreach ( $sessions as $session ) {
		if ( empty( $session['isFull'] ) ) {
			$next = $session;
			break;
		}
	}
	if ( ! $next && ! empty( $sessions ) ) {
		$next = $sessions[0];
	}
	if ( ! $next ) {
		return;
	}

	$detail_url = home_url( '/' . knowsia_page_slug() . '/' . rawurlencode( $course['courseCode'] ) );
	$seats      = knowsia_seats_label( $next );

	echo '<article class="kn-card">';

	// Poster, cropped by CSS to the top band (icon + colour) above the title
	// that is set into the artwork — see .kn-card__media. alt is deliberately
	// empty: the <h3> immediately below carries the same words, and describing
	// the image would make a screen reader announce the course name twice.
	if ( ! empty( $course['heroImage'] ) ) {
		printf(
			'<a class="kn-card__media" href="%s" tabindex="-1" aria-hidden="true"><img src="%s" alt="" width="900" height="1200" loading="lazy" decoding="async" /></a>',
			esc_url( $detail_url ),
			esc_url( $course['heroImage'] )
		);
	}

	printf(
		'<h3 class="kn-card__title"><a href="%s">%s</a></h3>',
		esc_url( $detail_url ),
		esc_html( $course['courseName'] )
	);

	if ( ! empty( $course['summary'] ) ) {
		printf( '<p class="kn-card__summary">%s</p>', esc_html( $course['summary'] ) );
	}

	printf(
		'<p class="kn-card__dates">%s</p>',
		esc_html( knowsia_date_range( $next['startDate'], $next['endDate'] ) )
	);

	echo '<div class="kn-card__price">' . knowsia_price_html( $next, $currency ) . '</div>'; // Escaped inside.

	if ( $seats ) {
		printf(
			'<p class="kn-card__seats%s">%s</p>',
			! empty( $next['isFull'] ) ? ' is-full' : '',
			esc_html( $seats )
		);
	}

	if ( count( $sessions ) > 1 ) {
		printf(
			'<p class="kn-card__more">%d cohort dates available</p>',
			count( $sessions )
		);
	}

	printf(
		'<a class="kn-btn kn-btn--primary" href="%s" rel="noopener">%s</a>',
		esc_url( $next['registerUrl'] ),
		! empty( $next['isFull'] ) ? 'Join the waitlist' : 'Register'
	);
	printf( '<a class="kn-btn kn-btn--ghost" href="%s">Full details</a>', esc_url( $detail_url ) );
	echo '</article>';
}

function knowsia_render_detail( $code ) {
	$data = knowsia_fetch( '/api/public/catalog/' . rawurlencode( $code ), 'detail_' . strtolower( $code ) );

	if ( is_wp_error( $data ) ) {
		if ( 'knowsia_not_found' === $data->get_error_code() ) {
			status_header( 404 );
			knowsia_render_unavailable( 'That programme is no longer available.' );
			return;
		}
		knowsia_render_unavailable( 'Programme information is temporarily unavailable — please check back shortly.' );
		return;
	}

	$course = isset( $data['course'] ) ? $data['course'] : null;
	if ( ! $course ) {
		status_header( 404 );
		knowsia_render_unavailable( 'That programme is no longer available.' );
		return;
	}

	$currency = isset( $course['currency'] ) ? $course['currency'] : 'GHS';
	$content  = isset( $course['content'] ) && is_array( $course['content'] ) ? $course['content'] : array();

	echo '<article class="kn-detail">';

	// Full 3:4 poster here — it is the one place the artwork stands alone with
	// room to be read, so it is NOT cropped like the catalogue card. Eager, not
	// lazy: it is the above-the-fold image on this page.
	if ( ! empty( $course['heroImage'] ) ) {
		printf(
			'<img class="kn-detail__poster" src="%s" alt="" width="900" height="1200" decoding="async" />',
			esc_url( $course['heroImage'] )
		);
	}

	printf( '<h1 class="kn-detail__title">%s</h1>', esc_html( $course['courseName'] ) );

	if ( ! empty( $course['summary'] ) ) {
		printf( '<p class="kn-detail__tagline">%s</p>', esc_html( $course['summary'] ) );
	}

	if ( ! empty( $content['overview'] ) && is_array( $content['overview'] ) ) {
		foreach ( $content['overview'] as $paragraph ) {
			printf( '<p>%s</p>', esc_html( $paragraph ) );
		}
	}

	if ( ! empty( $content['outcomes'] ) && is_array( $content['outcomes'] ) ) {
		printf(
			'<h2>%s</h2><ul class="kn-list">',
			esc_html( ! empty( $content['outcomesLabel'] ) ? $content['outcomesLabel'] : 'What you will learn' )
		);
		foreach ( $content['outcomes'] as $item ) {
			printf( '<li>%s</li>', esc_html( $item ) );
		}
		echo '</ul>';
	}

	if ( ! empty( $content['idealFor'] ) ) {
		printf( '<h2>Who it is for</h2><p>%s</p>', esc_html( $content['idealFor'] ) );
	}

	// Every cohort, each with its own price and register button — this is the
	// thing a course-level page cannot express.
	echo '<h2>Upcoming dates</h2><div class="kn-sessions">';
	foreach ( $course['sessions'] as $session ) {
		$seats = knowsia_seats_label( $session );
		echo '<div class="kn-session">';
		printf(
			'<p class="kn-session__dates"><strong>%s</strong>%s</p>',
			esc_html( knowsia_date_range( $session['startDate'], $session['endDate'] ) ),
			! empty( $session['startTime'] ) ? ' &middot; ' . esc_html( $session['startTime'] ) : ''
		);
		if ( ! empty( $session['facilitatorName'] ) ) {
			printf( '<p class="kn-session__tutor">Facilitator: %s</p>', esc_html( $session['facilitatorName'] ) );
		}
		echo '<div class="kn-session__price">' . knowsia_price_html( $session, $currency ) . '</div>';
		if ( $seats ) {
			printf( '<p class="kn-session__seats">%s</p>', esc_html( $seats ) );
		}
		printf(
			'<a class="kn-btn kn-btn--primary" href="%s" rel="noopener">%s</a>',
			esc_url( $session['registerUrl'] ),
			! empty( $session['isFull'] ) ? 'Join the waitlist' : 'Register'
		);
		echo '</div>';
	}
	echo '</div>';

	if ( ! empty( $content['faq'] ) && is_array( $content['faq'] ) ) {
		echo '<h2>Questions</h2>';
		foreach ( $content['faq'] as $item ) {
			printf(
				'<details class="kn-faq"><summary>%s</summary><p>%s</p></details>',
				esc_html( $item['question'] ),
				esc_html( $item['answer'] )
			);
		}
	}

	echo '</article>';

	knowsia_render_schema( $course );
}

/* -------------------------------------------------------------------------
 * SEO
 * ---------------------------------------------------------------------- */

/**
 * Course + CourseInstance JSON-LD.
 *
 * CourseInstance per cohort is the correct shape here: a bare Course cannot
 * express per-cohort dates and pricing, which is exactly what this catalogue
 * is about.
 */
function knowsia_render_schema( $course ) {
	$instances = array();
	foreach ( $course['sessions'] as $session ) {
		$instances[] = array(
			'@type'            => 'CourseInstance',
			'courseMode'       => 'online',
			'startDate'        => $session['startDate'],
			'endDate'          => $session['endDate'],
			'offers'           => array(
				'@type'         => 'Offer',
				'price'         => (string) $session['effectiveFee'],
				'priceCurrency' => isset( $course['currency'] ) ? $course['currency'] : 'GHS',
				'availability'  => ! empty( $session['isFull'] )
					? 'https://schema.org/SoldOut'
					: 'https://schema.org/InStock',
				'url'           => $session['registerUrl'],
			),
			'instructor'       => ! empty( $session['facilitatorName'] )
				? array(
					'@type' => 'Person',
					'name'  => $session['facilitatorName'],
				)
				: null,
		);
	}

	$schema = array(
		'@context'         => 'https://schema.org',
		'@type'            => 'Course',
		'name'             => $course['courseName'],
		'description'      => ! empty( $course['summary'] ) ? $course['summary'] : $course['courseName'],
		'provider'         => array(
			'@type' => 'Organization',
			'name'  => 'Knowsia',
			'url'   => home_url( '/' ),
		),
		'hasCourseInstance' => $instances,
	);

	echo '<script type="application/ld+json">'
		. wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		. '</script>';
}

/** Per-programme <title> and meta description, so detail pages are not all identical. */
add_filter(
	'document_title_parts',
	function ( $parts ) {
		$code = get_query_var( 'knowsia_code' );
		if ( ! $code ) {
			return $parts;
		}
		$data = knowsia_fetch( '/api/public/catalog/' . rawurlencode( $code ), 'detail_' . strtolower( $code ) );
		if ( ! is_wp_error( $data ) && ! empty( $data['course']['courseName'] ) ) {
			$parts['title'] = $data['course']['courseName'];
		}
		return $parts;
	}
);

add_action(
	'wp_head',
	function () {
		$code = get_query_var( 'knowsia_code' );
		if ( ! $code ) {
			return;
		}
		$data = knowsia_fetch( '/api/public/catalog/' . rawurlencode( $code ), 'detail_' . strtolower( $code ) );
		if ( is_wp_error( $data ) || empty( $data['course'] ) ) {
			return;
		}
		$course = $data['course'];
		if ( ! empty( $course['summary'] ) ) {
			printf( '<meta name="description" content="%s" />' . "\n", esc_attr( $course['summary'] ) );
		}
		// knowsia.com is canonical for programme content (decision 2026-08-05);
		// reg.knowsia.com/programmes redirects here.
		printf(
			'<link rel="canonical" href="%s" />' . "\n",
			esc_url( home_url( '/' . knowsia_page_slug() . '/' . rawurlencode( $course['courseCode'] ) ) )
		);
	},
	1
);

/* -------------------------------------------------------------------------
 * SETTINGS PAGE  (Settings > Knowsia Programmes)
 *
 * Exists so the plugin can be configured entirely from wp-admin, without SSH
 * or a wp-config.php edit. When the constant is defined it wins, and the
 * field is shown read-only so nobody wonders why their typing has no effect.
 * ---------------------------------------------------------------------- */

add_action(
	'admin_menu',
	function () {
		add_options_page(
			'Knowsia Programmes',
			'Knowsia Programmes',
			'manage_options',
			'knowsia-programmes',
			'knowsia_render_settings_page'
		);
	}
);

add_action(
	'admin_init',
	function () {
		register_setting( 'knowsia_programmes', 'knowsia_api_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( 'knowsia_programmes', 'knowsia_api_base', array( 'sanitize_callback' => 'esc_url_raw' ) );
		register_setting( 'knowsia_programmes', 'knowsia_page_slug', array( 'sanitize_callback' => 'sanitize_title' ) );
	}
);

function knowsia_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$key_from_config = defined( 'KNOWSIA_CATALOG_API_KEY' ) && KNOWSIA_CATALOG_API_KEY;

	// "Test connection" hits the real API and reports exactly what came back,
	// so a misconfiguration is diagnosed here rather than as a blank page.
	$test_result = null;
	if ( isset( $_POST['knowsia_test'] ) && check_admin_referer( 'knowsia_test_action' ) ) {
		delete_transient( KNOWSIA_CACHE_KEY . '_list' );
		$probe = knowsia_fetch( '/api/public/catalog', 'list' );
		if ( is_wp_error( $probe ) ) {
			$test_result = array( 'ok' => false, 'message' => $probe->get_error_message() );
		} else {
			$count       = isset( $probe['courses'] ) ? count( $probe['courses'] ) : 0;
			$test_result = array(
				'ok'      => true,
				'message' => sprintf( 'Connected. %d programme%s returned.', $count, 1 === $count ? '' : 's' ),
			);
		}
	}
	?>
	<div class="wrap">
		<h1>Knowsia Programmes</h1>

		<?php if ( $test_result ) : ?>
			<div class="notice notice-<?php echo $test_result['ok'] ? 'success' : 'error'; ?>">
				<p><?php echo esc_html( $test_result['message'] ); ?></p>
			</div>
		<?php endif; ?>

		<form method="post" action="options.php">
			<?php settings_fields( 'knowsia_programmes' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="knowsia_api_key">API key</label></th>
					<td>
						<?php if ( $key_from_config ) : ?>
							<input type="text" class="regular-text" value="Set in wp-config.php" disabled />
							<p class="description">Defined by <code>KNOWSIA_CATALOG_API_KEY</code>, which takes precedence over this field.</p>
						<?php else : ?>
							<input type="password" class="regular-text" id="knowsia_api_key"
								name="knowsia_api_key"
								value="<?php echo esc_attr( get_option( 'knowsia_api_key', '' ) ); ?>"
								autocomplete="off" />
							<p class="description">
								The same value as <code>CATALOG_API_KEY</code> in the Vercel project for reg.knowsia.com.
							</p>
							<?php
							// A fingerprint, not the secret: enough to compare against the
							// value shown in the Vercel dashboard without exposing it, and
							// enough to spot the two failures a password field hides —
							// a truncated paste (wrong length) and stray whitespace.
							$saved = knowsia_api_key();
							if ( $saved ) {
								$raw = (string) get_option( 'knowsia_api_key', '' );
								printf(
									'<p class="description"><strong>Saved key:</strong> %d characters, starts <code>%s</code>, ends <code>%s</code>%s</p>',
									strlen( $saved ),
									esc_html( substr( $saved, 0, 4 ) ),
									esc_html( substr( $saved, -4 ) ),
									$raw !== $saved
										? ' &mdash; <em>had surrounding whitespace, which is now trimmed automatically</em>'
										: ''
								);
								echo '<p class="description">Compare that length and those first/last characters with the value in Vercel. '
									. 'If they differ, the paste was truncated or is from a different key.</p>';
							}
							?>
						<?php endif; ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="knowsia_api_base">Portal URL</label></th>
					<td>
						<input type="url" class="regular-text" id="knowsia_api_base"
							name="knowsia_api_base"
							placeholder="https://reg.knowsia.com"
							value="<?php echo esc_attr( get_option( 'knowsia_api_base', '' ) ); ?>" />
						<p class="description">Leave blank unless the portal moves. Defaults to <code>https://reg.knowsia.com</code>.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="knowsia_page_slug">Page slug</label></th>
					<td>
						<?php if ( defined( 'KNOWSIA_PROGRAMMES_SLUG' ) && KNOWSIA_PROGRAMMES_SLUG ) : ?>
							<input type="text" class="regular-text" value="<?php echo esc_attr( knowsia_page_slug() ); ?>" disabled />
							<p class="description">Defined by <code>KNOWSIA_PROGRAMMES_SLUG</code> in wp-config.php, which takes precedence.</p>
						<?php else : ?>
							<input type="text" class="regular-text" id="knowsia_page_slug"
								name="knowsia_page_slug"
								placeholder="programmes"
								value="<?php echo esc_attr( get_option( 'knowsia_page_slug', '' ) ); ?>" />
							<p class="description">
								<strong>Must exactly match the slug of the page holding the shortcode.</strong>
								Currently <code>/<?php echo esc_html( knowsia_page_slug() ); ?>/</code>.
								This builds every "Full details" link and the detail-page URL rule — if it does
								not match, the grid still renders but <code>/<?php echo esc_html( knowsia_page_slug() ); ?>/AI02</code>
								will 404. Re-save permalinks after changing it.
							</p>
						<?php endif; ?>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Save settings' ); ?>
		</form>

		<hr />
		<h2>Test connection</h2>
		<p>Calls the live API and reports what came back. Run this before adding the page to your menu.</p>
		<form method="post">
			<?php wp_nonce_field( 'knowsia_test_action' ); ?>
			<?php submit_button( 'Test connection', 'secondary', 'knowsia_test', false ); ?>
		</form>

		<hr />
		<h2>How to display the catalogue</h2>
		<ol>
			<li>Create a Page with the slug <code><?php echo esc_html( knowsia_page_slug() ); ?></code>.</li>
			<li>Put this shortcode in its content: <code>[knowsia_programmes]</code></li>
			<li>Go to <a href="<?php echo esc_url( admin_url( 'options-permalink.php' ) ); ?>">Settings &rsaquo; Permalinks</a> and click Save once, so <code>/<?php echo esc_html( knowsia_page_slug() ); ?>/AI02</code> resolves.</li>
		</ol>
		<p>
			Catalogue: <a href="<?php echo esc_url( home_url( '/' . knowsia_page_slug() ) ); ?>" target="_blank"><?php echo esc_html( home_url( '/' . knowsia_page_slug() ) ); ?></a>
		</p>
	</div>
	<?php
}

/* -------------------------------------------------------------------------
 * STYLES  (inherits the active theme's typography; sets its own colours to
 * match the reg.knowsia.com portal tokens in app/globals.css, so the funnel
 * does not change palette when a visitor crosses from the catalogue to
 * registration. Assumes a light theme, as the previous rules did.
 * ---------------------------------------------------------------------- */

add_action(
	'wp_enqueue_scripts',
	function () {
		wp_register_style( 'knowsia-programmes', false, array(), '1.0.0' );
		wp_enqueue_style( 'knowsia-programmes' );
		wp_add_inline_style(
			'knowsia-programmes',
			'
			:root{
			--kn-primary:#0f172a;--kn-primary-hover:#1e293b;--kn-on-primary:#f8fafc;
			--kn-fg:#020817;--kn-muted-fg:#64748b;
			--kn-border:#e2e8f0;--kn-border-strong:#cbd5e1;--kn-tint:#f1f5f9;
			--kn-ring:#0f172a;--kn-motion:180ms ease}
			.kn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;margin:2rem 0}
			.kn-card{border:1px solid var(--kn-border);border-radius:12px;padding:1.25rem;display:flex;flex-direction:column;gap:.5rem;transition:border-color var(--kn-motion),box-shadow var(--kn-motion),transform var(--kn-motion)}
			.kn-card:hover{border-color:var(--kn-border-strong);box-shadow:0 4px 16px rgba(2,8,23,.08);transform:translateY(-2px)}
			.kn-card__media{display:block;margin:-1.25rem -1.25rem 0;border-radius:11px 11px 0 0;overflow:hidden;aspect-ratio:2/1;background:var(--kn-tint)}
			.kn-card__media img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
			.kn-card__title{margin:0;font-size:1.15rem;line-height:1.3}
			.kn-card__title a{color:var(--kn-fg);text-decoration:none;transition:color var(--kn-motion)}
			.kn-card__title a:hover{text-decoration:underline}
			.kn-card__summary{margin:0;color:var(--kn-muted-fg);font-size:.95rem}
			.kn-card__dates{margin:0;font-weight:600}
			.kn-card__seats{margin:0;font-size:.9rem;color:var(--kn-muted-fg)}
			.kn-card__seats.is-full{color:var(--kn-fg);font-weight:600}
			.kn-card__more{margin:0;font-size:.85rem;color:var(--kn-muted-fg)}
			.kn-price__was{color:var(--kn-muted-fg);margin-right:.35rem}
			.kn-price__note{display:block;font-size:.8rem;color:var(--kn-muted-fg)}
			.kn-price--free{font-weight:700}
			.kn-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.6rem 1.25rem;border-radius:8px;text-decoration:none;text-align:center;margin-top:.25rem;cursor:pointer;transition:background-color var(--kn-motion),border-color var(--kn-motion),color var(--kn-motion)}
			.kn-btn--primary{background:var(--kn-primary);color:var(--kn-on-primary)}
			.kn-btn--primary:hover{background:var(--kn-primary-hover);color:var(--kn-on-primary)}
			.kn-btn--ghost{border:1px solid var(--kn-border-strong);color:var(--kn-fg)}
			.kn-btn--ghost:hover{border-color:var(--kn-primary);background:var(--kn-tint)}
			.kn-btn:focus-visible,.kn-card__title a:focus-visible,.kn-faq>summary:focus-visible{outline:2px solid var(--kn-ring);outline-offset:2px}
			.kn-detail__poster{display:block;width:100%;max-width:340px;height:auto;aspect-ratio:3/4;object-fit:contain;border-radius:12px;background:var(--kn-tint);margin:0 0 1.5rem}
			.kn-sessions{display:grid;gap:1rem;margin:1rem 0}
			.kn-session{border:1px solid var(--kn-border);border-radius:10px;padding:1rem}
			.kn-session__dates{margin:0 0 .25rem}
			.kn-session__tutor,.kn-session__seats{margin:.25rem 0;font-size:.9rem;color:var(--kn-muted-fg)}
			.kn-faq{margin:.5rem 0}
			.kn-faq>summary{cursor:pointer;padding:.35rem 0}
			.kn-empty{padding:2rem;text-align:center;color:var(--kn-muted-fg)}
			@media (max-width:480px){.kn-grid{grid-template-columns:1fr}}
			@media (prefers-reduced-motion:reduce){.kn-card,.kn-btn,.kn-card__title a{transition:none}.kn-card:hover{transform:none}}
			'
		);
	}
);
