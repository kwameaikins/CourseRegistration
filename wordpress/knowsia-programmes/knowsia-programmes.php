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
 * SETUP
 *   1. Add to wp-config.php (never commit the real key):
 *        define( 'KNOWSIA_CATALOG_API_KEY', '...' );
 *        // Optional override, defaults to https://reg.knowsia.com
 *        define( 'KNOWSIA_CATALOG_API_BASE', 'https://reg.knowsia.com' );
 *   2. Activate the plugin.
 *   3. Create a Page with slug exactly "programmes" containing: [knowsia_programmes]
 *   4. Visit Settings > Permalinks once to flush rewrite rules.
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
define( 'KNOWSIA_PAGE_SLUG', 'programmes' );

/* -------------------------------------------------------------------------
 * API CLIENT
 * ---------------------------------------------------------------------- */

function knowsia_api_base() {
	return defined( 'KNOWSIA_CATALOG_API_BASE' )
		? rtrim( KNOWSIA_CATALOG_API_BASE, '/' )
		: 'https://reg.knowsia.com';
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

	if ( ! defined( 'KNOWSIA_CATALOG_API_KEY' ) || ! KNOWSIA_CATALOG_API_KEY ) {
		knowsia_log( 'KNOWSIA_CATALOG_API_KEY is not defined in wp-config.php' );
		return knowsia_fallback_or_error( $fallback_key, 'Catalogue is not configured.' );
	}

	$response = wp_remote_get(
		knowsia_api_base() . $path,
		array(
			'timeout' => 8,
			'headers' => array(
				'Authorization' => 'Bearer ' . KNOWSIA_CATALOG_API_KEY,
				'Accept'        => 'application/json',
			),
		)
	);

	if ( is_wp_error( $response ) ) {
		knowsia_log( 'Request failed for ' . $path . ': ' . $response->get_error_message() );
		return knowsia_fallback_or_error( $fallback_key, 'Could not reach the catalogue.' );
	}

	$code = wp_remote_retrieve_response_code( $response );

	// A 404 is a legitimate answer ("no such programme"), not an outage — do
	// not serve stale fallback data over it, or a retired programme would
	// linger on the site indefinitely.
	if ( 404 === $code ) {
		return new WP_Error( 'knowsia_not_found', 'Programme not found.' );
	}

	if ( 200 !== $code ) {
		knowsia_log( 'Unexpected HTTP ' . $code . ' for ' . $path );
		return knowsia_fallback_or_error( $fallback_key, 'Catalogue is temporarily unavailable.' );
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
			'^' . KNOWSIA_PAGE_SLUG . '/([A-Za-z0-9_-]+)/?$',
			'index.php?pagename=' . KNOWSIA_PAGE_SLUG . '&knowsia_code=$matches[1]',
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
			'^' . KNOWSIA_PAGE_SLUG . '/([A-Za-z0-9_-]+)/?$',
			'index.php?pagename=' . KNOWSIA_PAGE_SLUG . '&knowsia_code=$matches[1]',
			'top'
		);
		flush_rewrite_rules();
	}
);
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );

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

	$detail_url = home_url( '/' . KNOWSIA_PAGE_SLUG . '/' . rawurlencode( $course['courseCode'] ) );
	$seats      = knowsia_seats_label( $next );

	echo '<article class="kn-card">';
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
			esc_url( home_url( '/' . KNOWSIA_PAGE_SLUG . '/' . rawurlencode( $course['courseCode'] ) ) )
		);
	},
	1
);

/* -------------------------------------------------------------------------
 * STYLES  (minimal; inherits the active theme's typography and colours)
 * ---------------------------------------------------------------------- */

add_action(
	'wp_enqueue_scripts',
	function () {
		wp_register_style( 'knowsia-programmes', false, array(), '1.0.0' );
		wp_enqueue_style( 'knowsia-programmes' );
		wp_add_inline_style(
			'knowsia-programmes',
			'
			.kn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;margin:2rem 0}
			.kn-card{border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:1.25rem;display:flex;flex-direction:column;gap:.5rem}
			.kn-card__title{margin:0;font-size:1.15rem;line-height:1.3}
			.kn-card__summary{margin:0;opacity:.8;font-size:.95rem}
			.kn-card__dates{margin:0;font-weight:600}
			.kn-card__seats{margin:0;font-size:.9rem;opacity:.75}
			.kn-card__seats.is-full{opacity:1;font-weight:600}
			.kn-card__more{margin:0;font-size:.85rem;opacity:.7}
			.kn-price__was{opacity:.55;margin-right:.35rem}
			.kn-price__note{display:block;font-size:.8rem;opacity:.75}
			.kn-price--free{font-weight:700}
			.kn-btn{display:inline-block;padding:.6rem 1rem;border-radius:8px;text-decoration:none;text-align:center;margin-top:.25rem}
			.kn-btn--primary{background:#0f5132;color:#fff}
			.kn-btn--ghost{border:1px solid rgba(0,0,0,.2)}
			.kn-sessions{display:grid;gap:1rem;margin:1rem 0}
			.kn-session{border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:1rem}
			.kn-session__dates{margin:0 0 .25rem}
			.kn-session__tutor,.kn-session__seats{margin:.25rem 0;font-size:.9rem;opacity:.8}
			.kn-faq{margin:.5rem 0}
			.kn-empty{padding:2rem;text-align:center;opacity:.85}
			@media (max-width:480px){.kn-grid{grid-template-columns:1fr}}
			'
		);
	}
);
