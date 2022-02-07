
url = 'https://nod-prod.operations.dynamics.com/?mi=TSTimesheetEntryGridViewMyTimesheets'

projects = [
	# [ Number, Friendly name, Project ID, Category,  Image URL ]
	[0, 'NCS',          4455, 11170, 'https://www.nordicsemi.com/-/media/Images/Products/SDKs/nRFConnectSDK_new.png'],
	[1, 'Old nRF5 SDK', 4398, 11170, 'https://www.nordicsemi.com/-/media/Images/Products/SDKs/nRF5-SDK.png'],
	[2, 'Urlop',        9000, 95100, 'https://icons.getbootstrap.com/assets/icons/emoji-sunglasses.svg'],
	[3, 'L4',           9000, 94100, 'https://icons.getbootstrap.com/assets/icons/thermometer-high.svg'],
	[4, 'Chore dz.',    9000, 94300, 'https://us.123rf.com/450wm/goodstocker/goodstocker1810/goodstocker181000112/109750841-sick-child-boy-with-thermometer-in-his-mouth-cartoon-design-icon-colorful-flat-vector-illustration-i.jpg?ver=6'],
	[5, 'Brak',            0,     0, 'https://icons.getbootstrap.com/assets/icons/x-square.svg']
]

default_project = 0
empty_project = 5
default_hours = 8

from datetime import date, datetime, timedelta
import re
import os
import os.path
import json
from turtle import Turtle
from jinja2 import Template
from posixpath import dirname
from time import sleep
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import StaleElementReferenceException

if not (os.path.isfile(dirname(__file__) + '/chromedriver') or os.path.isfile(dirname(__file__) + '/chromedriver.exe')):
	print(f'Cannot find Chrome WebDriver binary in "{dirname(__file__)}" directory.')
	print('Download it from:')
	print('   https://chromedriver.storage.googleapis.com/index.html')
	exit(1)

os.environ["PATH"] = os.environ["PATH"] + ":" + dirname(__file__)

next_inject_id = 1

def filter_by_regex(elements, attr_name, regex=''):
	regex = re.compile(regex)
	result = []
	try:
		for e in elements:
			if type(attr_name) is list:
				match = True
				for m in attr_name:
					text = str(e.get_attribute(m[0]))
					match = match and re.fullmatch(m[1], text)
			else:
				text = str(e.get_attribute(attr_name))
				match = regex.fullmatch(text)
			if match:
				result.append(e)
	except StaleElementReferenceException:
		return []
	return result

def find_all_with_regex(selector, attr_name, regex=''):
	global driver
	start = datetime.now()
	arr = filter_by_regex(driver.find_elements_by_css_selector(selector), attr_name, regex)
	while len(arr) == 0:
		if (datetime.now() - start).seconds >= 15:
			raise TimeoutError()
		sleep(0.1)
		arr = filter_by_regex(driver.find_elements_by_css_selector(selector), attr_name, regex)
	return arr

def find_with_regex(selector, attr_name, regex=''):
	arr = find_all_with_regex(selector, attr_name, regex)
	assert len(arr) == 1
	return arr[0]

def get_tree_distance(base, element):
	parents = set()
	try:
		while base is not None:
			parents.add(base)
			base = base.find_element_by_xpath("./..")
	except:
		pass
	try:
		num = 0
		while element is not None:
			if element in parents:
				return num
			num += 1
			element = element.find_element_by_xpath("./..")
	except:
		pass
	return num

def inject_html(file, data = dict()):
	global driver, next_inject_id
	with open(file) as f:
		html = ' '.join(f.readlines())
	id = f'--injected-{next_inject_id}'
	next_inject_id += 1
	template = Template(html)
	html = template.render(id=id, **data)
	driver.execute_script(f'''
		let div = document.createElement("div");
		div.innerHTML = {json.dumps(html)};
		document.getElementsByTagName("body")[0].appendChild(div.firstChild);
		''')
	return driver.find_element_by_id(id)

def remove_html(window):
	global driver
	driver.execute_script('''
		arguments[0].innerHTML="";
		document.getElementsByTagName("body")[0].removeChild(arguments[0]);
		''', window)

def get_user_input(clear=False, name='_userInput'):
	global driver
	res = driver.execute_script(f'return window.{name}')
	if (res is not None) and clear:
		driver.execute_script(f'window.{name} = null')
	return res

def wait_for_user_input(driver):
	return get_user_input() is not None

def select_period():
	global driver
	new_button = find_with_regex('button', 'innerText', 'New')
	new_button.click()
	date_input = find_with_regex('input[type="text"]', 'id', r'TSTimesheetCreate.*DateFrom.*')
	now = date.today()
	periods = [
		{'name': 'This week', 'value': 0},
		{'name': 'Last week', 'value': 7},
		{'name': 'Two weeks ago', 'value': 2 * 7}
	]
	for p in periods:
		days = p['value']
		pstr = (now - timedelta(days)).strftime('%d.%m.%Y')
		p['name'] += f' ({pstr})'
	window = inject_html('period.html.jinja', { 'periods': periods })
	WebDriverWait(driver, 10000000).until(wait_for_user_input)
	remove_html(window)
	days = get_user_input(True)
	if days >= 0:
		date_str = (now - timedelta(days)).strftime('%d.%m.%Y')
		date_input.send_keys(Keys.CONTROL + 'a')
		date_input.send_keys(date_str)
		ok_button = find_with_regex('button', 'id', r'TSTimesheetCreate_.*_OK')
		ok_button.click()
		sleep(5)
		return True
	else:
		return False

def select_work():
	global driver, projects, default_project, empty_project, default_hours
	days = []
	for e in find_all_with_regex('div[data-dyn-columnname^="TSTimesheetLineWeek_Hours_"]', []):
		name = e.get_attribute('data-dyn-columnname')
		day = { 'id': name[-1:], 'text': e.get_attribute('innerText').strip(), 'checked': default_project }
		if day['text'][0] == '*':
			day['checked'] = empty_project
		days.append(day)
	window = inject_html('work.html.jinja', { 'days': days, 'projects': projects })
	WebDriverWait(driver, 10000000).until(wait_for_user_input)
	rows = []
	user_input = get_user_input(True)
	if user_input == 'cancel':
		remove_html(window)
		return False
	assert user_input == 'ok'
	for prj in projects:
		add = False
		row = {'prj': prj[2], 'cat': prj[3]}
		for day in days:
			radio = find_with_regex(f'#_my_prj_{day["id"]}_{prj[0]}', [])
			if radio.get_attribute('checked'):
				row[day['id']] = default_hours
				add = True
		if add and prj[2] != 0:
			rows.append(row)
	remove_html(window)
	for row in rows:
		new_button = find_with_regex('button', 'innerText', r'New line')
		new_button.click()
		proj_id_input = find_with_regex('input[type="text"]', [
			['id', r'ProjId_.*_input'],
			['value', r'']
		])
		proj_id_input.send_keys(str(row['prj']))
		cat_id_input = find_with_regex('input[type="text"]', [
			['id', r'CatergoryName_.*_input'],
			['value', r'']
		])
		cat_id_input.send_keys(str(row['cat']))
		for day in days:
			if day['id'] not in row:
				continue
			arr = find_all_with_regex('input[type="text"]', [
				['id', f'TSTimesheetLineWeek_Hours_{day["id"]}_.*_input'],
				['value', r'']
			])
			assert len(arr) > 0
			arr.sort(key = (lambda x : get_tree_distance(proj_id_input, x)))
			arr[0].send_keys(str(row[day['id']]))
		proj_id_input.click()
	find_with_regex('button', 'innerText', 'Save').click()
	sleep(0.5)
	find_with_regex('button', 'innerText', 'Workflow').click()
	return True

def select_menu():
	global driver
	window = inject_html('menu.html.jinja')
	WebDriverWait(driver, 10000000).until(wait_for_user_input)
	remove_html(window)
	return get_user_input(True)

options = ChromeOptions()
options.page_load_strategy = 'normal'
options.add_argument("user-data-dir=" + dirname(__file__) + "/user-data") 
driver = webdriver.Chrome(options=options)
driver.implicitly_wait(16)
driver.get(url)

state = 'new'

while True:
	try:
		if state == 'new':
			selected = select_period()
			state = 'work' if selected else 'menu'
		elif state == 'work':
			select_work()
			state = 'menu'
		elif state == 'menu':
			state = select_menu()
		elif state == 'exit':
			driver.quit()
			break
	except TimeoutError:
		get_user_input(True)
		window = inject_html('error.html.jinja')
		WebDriverWait(driver, 10000000).until(wait_for_user_input)
		remove_html(window)
		if get_user_input(True):
			state = 'menu'
		else:
			state = 'exit'
	except:
		try:
			driver.quit()
		except:
			pass
		raise
